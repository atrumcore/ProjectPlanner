/**
 * Anthropic Messages adapter.
 *
 * This is the original client body, moved behind the provider seam with its
 * behaviour intact: adaptive thinking display, a cached system prefix, and
 * the Opus-5 server-side refusal fallback. Those are real advantages of this
 * endpoint, and making the panel vendor-neutral should not mean levelling
 * every provider down to the least capable one.
 */

import Anthropic from '@anthropic-ai/sdk';
import PLANNER_SKILL_PROMPT from '../skill/planner-skill.md?raw';
import {
  AI_PLAN_RESPONSE_SCHEMA, PlanRefusalError, PlanTruncatedError, liveUserContent, parsePlanResponse,
} from '../aiClient';
import type { GenerateArgs, GenerateResult, ProviderTurn } from '../aiClient';
import { resolveBaseUrl } from '../providers';

type AnthropicTurn = Anthropic.Beta.Messages.BetaMessageParam;

function makeClient(apiKey: string, baseURL: string): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL,
    // BYO-key personal tool: the user's key stays in their own browser.
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
  });
}

/**
 * Rebuild the SDK turn list from neutral history.
 *
 * Assistant turns carry their original content blocks in `raw` — replaying
 * those verbatim is what keeps thinking blocks intact and the cached prefix
 * valid. A turn recorded under a different provider has no usable `raw`, so
 * it degrades to plain text rather than being sent as something the API
 * would reject.
 *
 * The last history turn carries a cache breakpoint. History is append-only
 * and now holds no document snapshots, so everything up to that point is
 * byte-stable across turns and reads at cache rates; the volatile current
 * document sits after it, in the live turn, where it belongs. Placing the
 * breakpoint on the live turn instead would cache a prefix that never
 * recurs — the document moves on every turn.
 */
function toAnthropicTurns(history: ProviderTurn[]): AnthropicTurn[] {
  return history.map((turn, i) => {
    const isLast = i === history.length - 1;
    const blocks: Anthropic.Beta.Messages.BetaContentBlockParam[] =
      turn.raw && Array.isArray(turn.raw)
        ? [...(turn.raw as Anthropic.Beta.Messages.BetaContentBlockParam[])]
        : [{ type: 'text', text: turn.text }];

    if (isLast && blocks.length > 0) {
      const last = blocks[blocks.length - 1];
      blocks[blocks.length - 1] = { ...last, cache_control: { type: 'ephemeral' } } as typeof last;
    }
    return { role: turn.role, content: blocks };
  });
}

export async function generateAnthropic(args: GenerateArgs): Promise<GenerateResult> {
  const client = makeClient(args.provider.apiKey ?? '', resolveBaseUrl(args.provider));
  const userContent = liveUserContent(args);

  const stream = client.beta.messages.stream(
    {
      model: args.model,
      max_tokens: 64000,
      // If Opus 5's safety classifiers decline, retry server-side on
      // Anthropic's recommended fallback model instead of failing the turn.
      // (Opus-only parameter — other models handle refusals as plain errors.)
      ...(args.model === 'claude-opus-5'
        ? { betas: ['server-side-fallback-2026-07-01' as const], fallbacks: 'default' as const }
        : {}),
      // Thinking is on by default on this model; summarized display gives the
      // panel a live "what I'm considering" narrative while the JSON drafts.
      thinking: { type: 'adaptive', display: 'summarized' },
      // Stable prefix first (prompt-cache friendly): the skill prompt never
      // changes; the volatile document + conversation follow in messages.
      system: [
        { type: 'text', text: PLANNER_SKILL_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [...toAnthropicTurns(args.history), { role: 'user', content: userContent }],
      // Effort is the main quality/latency dial on this model and was never
      // set, so every request ran at the `high` default — a one-bar tweak cost
      // the same as a twelve-project replan.
      output_config: {
        effort: args.effort,
        format: { type: 'json_schema', schema: AI_PLAN_RESPONSE_SCHEMA },
      },
    },
    { signal: args.signal },
  );

  let jsonChars = 0;
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        args.onThinking(event.delta.thinking);
      } else if (event.delta.type === 'text_delta') {
        jsonChars += event.delta.text.length;
        args.onProgress(jsonChars);
      }
    }
  }

  const msg = await stream.finalMessage();

  // Check the stop reason before touching content: a refusal can arrive with
  // empty or partial content even after the server-side fallback chain.
  if (msg.stop_reason === 'refusal') {
    throw new PlanRefusalError(msg.stop_details?.category ?? null);
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new PlanTruncatedError();
  }

  const text = msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const response = parsePlanResponse(text);

  return {
    response,
    // The request alone — the document this turn was answered against is not
    // stored, so it cannot come back next turn as a stale second opinion.
    userTurn: { role: 'user', text: args.request },
    // `text` is the portable summary another provider could read; `raw` keeps
    // the full blocks (thinking included) that this API needs replayed
    // verbatim to stay coherent and cache-valid.
    assistantTurn: { role: 'assistant', text: response.summary, raw: msg.content },
    jsonMode: 'schema',
  };
}

/** Model ids advertised by the Anthropic API, for the dialog's fetch button. */
export async function listAnthropicModels(
  apiKey: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const client = makeClient(apiKey, baseUrl);
  const page = await client.models.list({ limit: 50 }, { signal });
  return page.data.map(m => m.id);
}
