/**
 * The provider-neutral seam. The rest of the app talks in plain data
 * (AiPlanResponse, ProviderTurn, ProviderFailure) and never imports a vendor
 * SDK; each wire format lives in an adapter under ./adapters.
 *
 * This file owns what is genuinely shared: the request/result contract, the
 * user-turn framing, response parsing and shape-checking, and the mapping
 * from any thrown thing to a sentence a user can act on.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AI_PLAN_RESPONSE_SCHEMA } from './skill/aiPlan';
import type { AiPlanResponse } from './skill/aiPlan';
import { generateAnthropic } from './adapters/anthropic';
import { generateOpenAiChat } from './adapters/openaiChat';
import type { Provider } from './providers';

export { AI_PLAN_RESPONSE_SCHEMA };

/**
 * One conversation turn, in a shape every provider can hold.
 *
 * `text` is the portable content. `raw` carries vendor-specific blocks that
 * must be replayed verbatim — Anthropic assistant turns include thinking
 * blocks, and dropping them invalidates the cached prefix. An adapter uses
 * `raw` when it recognises it and falls back to `text` when it does not,
 * which is what lets history survive inside one provider without pretending
 * it can cross between them.
 */
export interface ProviderTurn {
  role: 'user' | 'assistant';
  text: string;
  raw?: unknown;
}

/** How strictly the endpoint agreed to enforce our JSON schema. Surfaced in
 * the composer so a flaky endpoint explains itself. */
export type JsonMode = 'schema' | 'json-object' | 'prompt-only';

export const JSON_MODE_LABEL: Record<JsonMode, string> = {
  schema: 'Schema-enforced JSON',
  'json-object': 'JSON mode (schema in prompt)',
  'prompt-only': 'Prompt-only JSON',
};

/** How hard the model should work on a turn. Anthropic's effort levels; other
 * wire formats have no portable equivalent and ignore it. */
export type Effort = 'low' | 'high' | 'xhigh';

export const EFFORT_OPTIONS: Array<{ id: Effort; label: string; hint: string }> = [
  { id: 'low', label: 'Quick', hint: 'Small edits — move a bar, rename a phase.' },
  { id: 'high', label: 'Balanced', hint: 'The default. Good for most requests.' },
  { id: 'xhigh', label: 'Thorough', hint: 'Whole-plan work worth the extra time.' },
];

export const DEFAULT_EFFORT: Effort = 'high';

export function isEffort(v: string): v is Effort {
  return EFFORT_OPTIONS.some(o => o.id === v);
}

export interface GenerateArgs {
  provider: Provider;
  model: string;
  effort: Effort;
  /** Prior turns, replayed so the conversation prefix stays cache-valid.
   * These carry the request text only — never a document snapshot. */
  history: ProviderTurn[];
  /** The user's request, verbatim. */
  request: string;
  /**
   * The current document, framed onto THIS turn only.
   *
   * Kept separate from `request` so the two can be recombined for the live
   * turn and stored apart afterwards. Framing them together before storage is
   * what made every historical turn carry its own full snapshot of the plan:
   * by turn five the model received five copies, four of them stale, and had
   * to work out which one was current.
   */
  documentJson: string;
  onThinking: (delta: string) => void;
  onProgress: (totalChars: number) => void;
  signal: AbortSignal;
}

export interface GenerateResult {
  response: AiPlanResponse;
  /** The exact turns to append to history for the next request. */
  userTurn: ProviderTurn;
  assistantTurn: ProviderTurn;
  /** Which JSON mode the endpoint accepted, when the adapter negotiates. */
  jsonMode?: JsonMode;
}

/** Wrap the current-document projection and the user's request into the
 * user-turn format the planner skill contract expects. Applied to the live
 * turn at send time; the stored turn keeps the request alone. */
export function makeUserTurn(currentDocJson: string, request: string): string {
  return `<current_document>\n${currentDocJson}\n</current_document>\n\n<request>\n${request}\n</request>`;
}

/** The live turn's content: current document plus this request. */
export function liveUserContent(args: Pick<GenerateArgs, 'documentJson' | 'request'>): string {
  return makeUserTurn(args.documentJson, args.request);
}

export class PlanRefusalError extends Error {
  category: string | null;
  constructor(category: string | null) {
    super(category ? `The model declined this request (${category}).` : 'The model declined this request.');
    this.name = 'PlanRefusalError';
    this.category = category;
  }
}

export class PlanTruncatedError extends Error {
  constructor() {
    super('The generated plan was too large and got cut off.');
    this.name = 'PlanTruncatedError';
  }
}

/** Thrown when a reply is not the plan contract. Carries the reason so an
 * adapter can feed it back to the model on a repair retry. */
export class PlanParseError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`The model returned a plan that could not be read: ${reason}`);
    this.name = 'PlanParseError';
    this.reason = reason;
  }
}

/** An HTTP failure from a raw-fetch adapter, carrying enough to categorise. */
export class ProviderHttpError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `HTTP ${status}`);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Parse and shape-check a model's reply against the plan contract.
 * Shared by every adapter so "what counts as a valid plan" is defined once —
 * and so the repair retry has a precise reason to hand back.
 */
export function parsePlanResponse(text: string): AiPlanResponse {
  const trimmed = extractJsonObject(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new PlanParseError(err instanceof Error ? err.message : 'invalid JSON');
  }
  const response = parsed as AiPlanResponse;
  if (typeof response?.summary !== 'string') {
    throw new PlanParseError('missing a string "summary" field');
  }
  if (typeof response?.plan !== 'object' || response.plan === null) {
    throw new PlanParseError('missing a "plan" object');
  }
  if (!Array.isArray(response.plan.projects)) {
    throw new PlanParseError('"plan.projects" was not an array');
  }
  return response;
}

/**
 * Pull the JSON object out of a reply that may be wrapped.
 *
 * Only endpoints that enforce a schema reliably return bare JSON. In
 * prompt-only mode a model will often fence the block or add a line of
 * preamble, and failing the whole turn over a ``` would make weaker
 * endpoints look broken when the plan itself is fine.
 */
function extractJsonObject(text: string): string {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  if (t.startsWith('{')) return t;
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) return t.slice(first, last + 1);
  return t;
}

/** Route to the adapter for this provider's wire format. */
export function generatePlan(args: GenerateArgs): Promise<GenerateResult> {
  switch (args.provider.apiType) {
    case 'anthropic':
      return generateAnthropic(args);
    case 'openai-chat':
      return generateOpenAiChat(args);
  }
}

/** Categorised, user-facing description of anything generatePlan can throw.
 * Keeps SDK error classes and raw HTTP out of the store and UI. */
export interface ProviderFailure {
  kind: 'auth' | 'rate-limit' | 'network' | 'refusal' | 'truncated' | 'aborted' | 'api' | 'other';
  message: string;
}

export function describeProviderFailure(err: unknown, provider?: Provider): ProviderFailure {
  const who = provider?.name ?? 'the provider';

  if (err instanceof PlanRefusalError) return { kind: 'refusal', message: err.message };
  if (err instanceof PlanTruncatedError) {
    return { kind: 'truncated', message: `${err.message} Try splitting the request into smaller steps.` };
  }
  if (err instanceof PlanParseError) {
    return {
      kind: 'other',
      message: `${err.message} This usually means the model is too small to hold the plan format — try a stronger one.`,
    };
  }

  // Raw-fetch adapters: categorise by status before falling through.
  if (err instanceof ProviderHttpError) {
    if (err.status === 401 || err.status === 403) {
      return { kind: 'auth', message: `${who} rejected your API key. Check it and save it again.` };
    }
    if (err.status === 429) {
      return { kind: 'rate-limit', message: `Rate limited by ${who} — wait a moment and try again.` };
    }
    if (err.status === 404) {
      return {
        kind: 'api',
        message: `${who} returned 404. Check the base URL points at the API root (it usually ends in /v1) and that the model id exists.`,
      };
    }
    return { kind: 'api', message: `${who} returned ${err.status}: ${err.detail}` };
  }

  // Anthropic SDK classes. APIConnectionError subclasses APIError — check first.
  if (err instanceof Anthropic.APIUserAbortError) return { kind: 'aborted', message: 'Stopped.' };
  if (err instanceof Anthropic.AuthenticationError) {
    return { kind: 'auth', message: `${who} rejected your API key. Check it and save it again.` };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { kind: 'rate-limit', message: `Rate limited by ${who} — wait a moment and try again.` };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { kind: 'network', message: `Couldn't reach ${who}. Check your connection and the base URL, then try again.` };
  }
  if (err instanceof Anthropic.APIError) {
    return { kind: 'api', message: `API error${err.status ? ` ${err.status}` : ''}: ${err.message}` };
  }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return { kind: 'aborted', message: 'Stopped.' };
  }
  // fetch() rejects with a bare TypeError for DNS, refused connections and
  // CORS — all indistinguishable from the browser, so say so plainly.
  if (err instanceof TypeError) {
    return {
      kind: 'network',
      message: `Couldn't reach ${who}. Check the base URL is right, the server is running, and that it allows browser requests (CORS).`,
    };
  }
  return { kind: 'other', message: err instanceof Error ? err.message : 'Something went wrong.' };
}
