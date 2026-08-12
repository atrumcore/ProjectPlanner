/**
 * All Anthropic SDK usage lives in this file — the rest of the app talks in
 * plain data (AiPlanResponse, message params, ClaudeFailure). Swapping the
 * direct browser→api.anthropic.com call for a server-side proxy later means
 * touching only this module (see BASE_URL below).
 */

import Anthropic from '@anthropic-ai/sdk';
import PLANNER_SKILL_PROMPT from './skill/planner-skill.md?raw';
import { AI_PLAN_RESPONSE_SCHEMA } from './skill/aiPlan';
import type { AiPlanResponse } from './skill/aiPlan';

/** Future swap point: set to a Cloudflare Worker route (e.g. '/api/claude')
 * and drop the per-user key + browser-access header. */
const BASE_URL: string | undefined = undefined;

/** Models the panel offers. First entry is the default. Each user picks per
 * browser (they pay for their own usage); the choice persists alongside the
 * API key. */
export const CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-opus-5', label: 'Opus 5 — most capable' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 — faster, cheaper' },
] as const;

export const DEFAULT_MODEL = CLAUDE_MODEL_OPTIONS[0].id;

export function isKnownModel(id: string): boolean {
  return CLAUDE_MODEL_OPTIONS.some(m => m.id === id);
}

/** One conversation turn as sent to the API. Aliased so the rest of the app
 * never imports SDK types directly. */
export type ChatTurn = Anthropic.Beta.Messages.BetaMessageParam;

function makeClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL: BASE_URL,
    // This is a BYO-key personal tool: the user pastes their own key, which
    // stays in their own browser. Both flags below opt into that model.
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
  });
}

/** Rough sanity check for a pasted key — not validation, just typo-catching. */
export function looksLikeApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{10,}$/.test(key.trim());
}

/** Wrap the current-document projection and the user's request into the
 * user-turn format the planner skill contract expects. */
export function makeUserTurn(currentDocJson: string, request: string): string {
  return `<current_document>\n${currentDocJson}\n</current_document>\n\n<request>\n${request}\n</request>`;
}

export class ClaudeRefusalError extends Error {
  category: string | null;
  constructor(category: string | null) {
    super(category ? `Claude declined this request (${category}).` : 'Claude declined this request.');
    this.name = 'ClaudeRefusalError';
    this.category = category;
  }
}

export class ClaudeTruncatedError extends Error {
  constructor() {
    super('The generated plan was too large and got cut off.');
    this.name = 'ClaudeTruncatedError';
  }
}

export interface GenerateArgs {
  apiKey: string;
  /** One of CLAUDE_MODEL_OPTIONS ids. */
  model: string;
  /** Prior turns, replayed verbatim (assistant turns include thinking blocks). */
  history: ChatTurn[];
  /** The new user turn (from makeUserTurn). */
  userContent: string;
  onThinking: (delta: string) => void;
  onProgress: (totalChars: number) => void;
  signal: AbortSignal;
}

export interface GenerateResult {
  response: AiPlanResponse;
  /** The exact turns to append to history for the next request. */
  userTurn: ChatTurn;
  assistantTurn: ChatTurn;
}

export async function generatePlan(args: GenerateArgs): Promise<GenerateResult> {
  const client = makeClient(args.apiKey);

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
      messages: [...args.history, { role: 'user', content: args.userContent }],
      output_config: { format: { type: 'json_schema', schema: AI_PLAN_RESPONSE_SCHEMA } },
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
    throw new ClaudeRefusalError(msg.stop_details?.category ?? null);
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new ClaudeTruncatedError();
  }

  const text = msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned a plan that could not be parsed.');
  }
  const response = parsed as AiPlanResponse;
  if (
    typeof response?.summary !== 'string' ||
    typeof response?.plan !== 'object' || response.plan === null ||
    !Array.isArray(response.plan.projects)
  ) {
    throw new Error('Claude returned a plan in an unexpected shape.');
  }

  return {
    response,
    userTurn: { role: 'user', content: args.userContent },
    // Replay the full content (thinking blocks included) verbatim next turn.
    assistantTurn: { role: 'assistant', content: msg.content },
  };
}

/** Categorised, user-facing description of anything generatePlan can throw.
 * Keeps SDK error classes out of the store/UI. */
export interface ClaudeFailure {
  kind: 'auth' | 'rate-limit' | 'network' | 'refusal' | 'truncated' | 'aborted' | 'api' | 'other';
  message: string;
}

export function describeClaudeFailure(err: unknown): ClaudeFailure {
  if (err instanceof ClaudeRefusalError) return { kind: 'refusal', message: err.message };
  if (err instanceof ClaudeTruncatedError) {
    return { kind: 'truncated', message: `${err.message} Try splitting the request into smaller steps.` };
  }
  if (err instanceof Anthropic.APIUserAbortError) return { kind: 'aborted', message: 'Stopped.' };
  if (err instanceof Anthropic.AuthenticationError) {
    return { kind: 'auth', message: 'Your API key was rejected by Anthropic. Check it and paste it again.' };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { kind: 'rate-limit', message: 'Rate limited by the API — wait a moment and try again.' };
  }
  // Note: APIConnectionError subclasses APIError in the TS SDK — check it first.
  if (err instanceof Anthropic.APIConnectionError) {
    return { kind: 'network', message: "Couldn't reach api.anthropic.com. Check your connection and try again." };
  }
  if (err instanceof Anthropic.APIError) {
    return { kind: 'api', message: `API error${err.status ? ` ${err.status}` : ''}: ${err.message}` };
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { kind: 'aborted', message: 'Stopped.' };
  }
  return { kind: 'other', message: err instanceof Error ? err.message : 'Something went wrong.' };
}
