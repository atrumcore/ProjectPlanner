/**
 * OpenAI Chat Completions adapter — the portable one.
 *
 * Written against plain `fetch` rather than a vendor SDK, because the whole
 * point is arbitrary hosts: OpenAI, Azure, OpenRouter, Groq, Together,
 * Mistral, vLLM, Ollama and LM Studio all speak this shape, and an SDK would
 * add a dependency while making the base URL harder to redirect, not easier.
 *
 * Two things vary between those hosts and are negotiated once per
 * provider+model, then cached:
 *
 *  - how strictly JSON can be enforced (see JsonMode)
 *  - whether the token cap is `max_tokens` or `max_completion_tokens`
 *
 * Negotiating on every turn would waste a round trip each time; negotiating
 * never would mean picking a lowest common denominator and giving OpenAI
 * users worse output than their endpoint can actually deliver.
 */

import PLANNER_SKILL_PROMPT from '../skill/planner-skill.md?raw';
import {
  AI_PLAN_RESPONSE_SCHEMA, PlanParseError, PlanTruncatedError, ProviderHttpError,
  liveUserContent, parsePlanResponse,
} from '../aiClient';
import type { GenerateArgs, GenerateResult, JsonMode, ProviderTurn } from '../aiClient';
import { resolveBaseUrl } from '../providers';

const MAX_OUTPUT_TOKENS = 32000;

type TokenParam = 'max_tokens' | 'max_completion_tokens';

interface Negotiated {
  jsonMode: JsonMode;
  tokenParam: TokenParam;
}

/** Per provider+model, so switching model re-negotiates but switching back
 * does not. Deliberately module-level and not persisted — an endpoint's
 * capabilities can change under us, and a session is the right lifetime. */
const negotiatedCache = new Map<string, Negotiated>();

const cacheKey = (providerId: string, model: string) => `${providerId}:${model}`;

/**
 * OpenAI's strict structured-output mode accepts a subset of JSON Schema and
 * rejects `format` outright. Our contract uses `format: 'date'` in four
 * places purely as documentation — the planner prompt already states the
 * YYYY-MM-DD rule — so stripping it costs nothing and buys real schema
 * enforcement instead of dropping to the weaker json_object rung.
 */
function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'format') continue;
    out[k] = toStrictSchema(v);
  }
  return out;
}

const STRICT_SCHEMA = toStrictSchema(AI_PLAN_RESPONSE_SCHEMA);

/** Without native enforcement the shape has to travel in the prompt. */
function systemPromptFor(mode: JsonMode): string {
  if (mode === 'schema') return PLANNER_SKILL_PROMPT;
  return `${PLANNER_SKILL_PROMPT}

## Response format

Reply with a single JSON object and nothing else — no prose, no markdown
fence. It must validate against this JSON Schema:

${JSON.stringify(STRICT_SCHEMA)}`;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function toChatMessages(history: ProviderTurn[], mode: JsonMode, userContent: string): ChatMessage[] {
  return [
    { role: 'system', content: systemPromptFor(mode) },
    // `raw` holds vendor blocks from another provider's turn format; only the
    // portable text crosses over.
    ...history.map(t => ({ role: t.role, content: t.text })),
    { role: 'user', content: userContent },
  ];
}

function bodyFor(args: GenerateArgs, messages: ChatMessage[], n: Negotiated): string {
  const body: Record<string, unknown> = {
    model: args.model,
    messages,
    stream: true,
    [n.tokenParam]: MAX_OUTPUT_TOKENS,
  };
  if (n.jsonMode === 'schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'plan_response', schema: STRICT_SCHEMA, strict: true },
    };
  } else if (n.jsonMode === 'json-object') {
    body.response_format = { type: 'json_object' };
  }
  return JSON.stringify(body);
}

function headersFor(apiKey: string | undefined): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  // Keyless local runners (Ollama, LM Studio) reject an empty Bearer header,
  // so send none at all rather than an empty one.
  if (apiKey?.trim()) h.Authorization = `Bearer ${apiKey.trim()}`;
  return h;
}

/** What a streamed chunk can carry. `reasoning_content` (DeepSeek, Ollama)
 * and `reasoning` (OpenRouter) are the two spellings in the wild for a
 * thinking narrative; both feed the panel's live "considering" line. */
interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

interface StreamOutcome {
  text: string;
  finishReason: string | null;
}

/**
 * Read an SSE body to completion.
 *
 * Chunks do not align to line boundaries, so a partial `data:` line is held
 * in `buffer` until its newline arrives — parsing per network chunk instead
 * would drop or corrupt whichever token happened to straddle the split.
 */
async function readStream(
  res: Response,
  onText: (delta: string) => void,
  onThinking: (delta: string) => void,
): Promise<StreamOutcome> {
  const reader = res.body?.getReader();
  if (!reader) throw new ProviderHttpError(res.status, 'The response had no body to stream.');

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;

      let chunk: StreamChunk;
      try { chunk = JSON.parse(payload); } catch { continue; }

      // Some gateways report mid-stream failures in-band with HTTP 200.
      if (chunk.error?.message) throw new ProviderHttpError(res.status, chunk.error.message);

      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const reasoning = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
      if (reasoning) onThinking(reasoning);

      const content = choice.delta?.content;
      if (content) {
        text += content;
        onText(content);
      }
    }
  }

  return { text, finishReason };
}

async function errorFrom(res: Response): Promise<ProviderHttpError> {
  let detail = res.statusText;
  try {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } | string };
      const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
      detail = msg || body.slice(0, 300);
    } catch {
      detail = body.slice(0, 300) || res.statusText;
    }
  } catch { /* keep statusText */ }
  return new ProviderHttpError(res.status, detail);
}

/** True when a 400 is the endpoint rejecting a capability rather than the
 * request being wrong — the signal to step down a rung. */
function rejectsCapability(err: ProviderHttpError, what: 'json' | 'tokens'): boolean {
  if (err.status !== 400 && err.status !== 422) return false;
  const d = err.detail.toLowerCase();
  return what === 'json'
    ? d.includes('response_format') || d.includes('json_schema') || d.includes('json mode') || d.includes('schema')
    : d.includes('max_tokens') || d.includes('max_completion_tokens');
}

const NEXT_RUNG: Record<JsonMode, JsonMode | null> = {
  schema: 'json-object',
  'json-object': 'prompt-only',
  'prompt-only': null,
};

async function attempt(
  args: GenerateArgs,
  n: Negotiated,
  messages: ChatMessage[],
): Promise<StreamOutcome> {
  const url = `${resolveBaseUrl(args.provider)}/chat/completions`;
  let charCount = 0;

  const res = await fetch(url, {
    method: 'POST',
    headers: headersFor(args.provider.apiKey),
    body: bodyFor(args, messages, n),
    signal: args.signal,
  });

  if (!res.ok) throw await errorFrom(res);

  return readStream(
    res,
    delta => { charCount += delta.length; args.onProgress(charCount); },
    args.onThinking,
  );
}

/** Run one request, stepping down the capability ladder on rejection. */
async function negotiateAndSend(args: GenerateArgs, userContent: string): Promise<{
  outcome: StreamOutcome;
  negotiated: Negotiated;
}> {
  const key = cacheKey(args.provider.id, args.model);
  const n: Negotiated = negotiatedCache.get(key) ?? { jsonMode: 'schema', tokenParam: 'max_tokens' };

  for (;;) {
    try {
      const outcome = await attempt(args, n, toChatMessages(args.history, n.jsonMode, userContent));
      negotiatedCache.set(key, { ...n });
      return { outcome, negotiated: { ...n } };
    } catch (err) {
      if (!(err instanceof ProviderHttpError)) throw err;

      if (rejectsCapability(err, 'tokens') && n.tokenParam === 'max_tokens') {
        n.tokenParam = 'max_completion_tokens';
        continue;
      }
      if (rejectsCapability(err, 'json')) {
        const next = NEXT_RUNG[n.jsonMode];
        if (next) { n.jsonMode = next; continue; }
      }
      throw err;
    }
  }
}

export async function generateOpenAiChat(args: GenerateArgs): Promise<GenerateResult> {
  const userContent = liveUserContent(args);
  const { outcome, negotiated } = await negotiateAndSend(args, userContent);

  if (outcome.finishReason === 'length') throw new PlanTruncatedError();

  // The request alone goes into history — never the document snapshot it was
  // answered against — and the assistant turn keeps its summary rather than
  // the whole plan JSON. Both otherwise recur verbatim on every later turn.
  const turns = (summary: string) => ({
    userTurn: { role: 'user' as const, text: args.request },
    assistantTurn: { role: 'assistant' as const, text: summary },
  });

  try {
    const response = parsePlanResponse(outcome.text);
    return { response, ...turns(response.summary), jsonMode: negotiated.jsonMode };
  } catch (err) {
    if (!(err instanceof PlanParseError)) throw err;

    // One repair pass. Without native schema enforcement a capable model
    // still drifts occasionally — usually a stray sentence before the object
    // — and handing back the exact parse error fixes it far more often than
    // it costs. Failing outright here would make every such endpoint look
    // broken when the plan itself was fine.
    const repairPrompt = `${userContent}

Your previous reply could not be read: ${err.reason}
Reply again with ONLY the JSON object. No prose, no markdown fence.`;

    const retry = await negotiateAndSend(args, repairPrompt);
    if (retry.outcome.finishReason === 'length') throw new PlanTruncatedError();

    const response = parsePlanResponse(retry.outcome.text);
    return { response, ...turns(response.summary), jsonMode: retry.negotiated.jsonMode };
  }
}

/** Model ids from `GET {baseUrl}/models`, for the dialog's fetch button.
 * Not every host implements it, so the dialog keeps manual entry available. */
export async function listOpenAiModels(
  apiKey: string | undefined,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
    headers: headersFor(apiKey),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
  return (body.data ?? [])
    .map(m => m.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}
