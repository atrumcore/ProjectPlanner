/**
 * The provider registry — who the assistant talks to, and how.
 *
 * The panel used to assume Anthropic: one key, one hardcoded model list. It
 * now holds a list of user-registered endpoints, each declaring an `apiType`
 * that selects a request adapter (src/ai/adapters). Anthropic is one entry in
 * that list rather than the shape of the whole feature.
 *
 * Nothing here talks to a network. Registry persistence and validation only;
 * the adapters own the wire format.
 */

export const PROVIDERS_STORAGE = 'bbd-planner-ai-providers';
export const ACTIVE_STORAGE = 'bbd-planner-ai-active';

/** Wire formats the panel knows how to speak. */
export type ApiType = 'anthropic' | 'openai-chat';

export const API_TYPE_OPTIONS: Array<{ id: ApiType; label: string; hint: string }> = [
  {
    id: 'openai-chat',
    label: 'Chat Completions',
    hint: 'OpenAI and anything that speaks its API — Azure, OpenRouter, Groq, Together, vLLM, Ollama, LM Studio, most corporate gateways.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Messages',
    hint: "Anthropic's own API. Adds streamed reasoning, prompt caching and refusal fallback.",
  },
];

export interface Provider {
  id: string;
  /** User-chosen display name, shown in the model picker. */
  name: string;
  apiType: ApiType;
  /** Omitted for keyless local runners — see `providerNeedsKey`. */
  apiKey?: string;
  /** Omitted to use the vendor default host. */
  baseUrl?: string;
  /** Model ids offered in the composer, fetched or typed by the user. */
  models: string[];
}

/** What the composer's `<select>` is pointing at. */
export interface ActiveChoice {
  providerId: string;
  model: string;
}

/** Default host per api type, used when a provider sets no baseUrl. */
export const DEFAULT_BASE_URL: Record<ApiType, string> = {
  anthropic: 'https://api.anthropic.com',
  'openai-chat': 'https://api.openai.com/v1',
};

/** Models offered when someone adds Anthropic from the one-click shortcut.
 * Only a starting point — the user can edit the list like any other provider. */
export const ANTHROPIC_SUGGESTED_MODELS = ['claude-opus-5', 'claude-sonnet-5'];

/**
 * A key is required against a vendor's own cloud, but NOT against a custom
 * host: Ollama and LM Studio serve an OpenAI-shaped API with no auth at all,
 * and demanding a key would lock out exactly the self-hosted users this
 * feature exists for. Gateways that do want auth simply get one filled in.
 */
export function providerNeedsKey(p: Pick<Provider, 'apiType' | 'baseUrl'>): boolean {
  return !p.baseUrl?.trim();
}

/** Field-level problems, keyed by field, for inline display in the dialog.
 * Empty object means the provider is savable. */
export function validateProvider(
  p: Partial<Provider>,
  others: Provider[],
): Partial<Record<'name' | 'apiKey' | 'baseUrl' | 'models', string>> {
  const errors: Partial<Record<'name' | 'apiKey' | 'baseUrl' | 'models', string>> = {};

  const name = p.name?.trim() ?? '';
  if (!name) errors.name = 'Give this provider a name.';
  else if (others.some(o => o.id !== p.id && o.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'Another provider already uses that name.';
  }

  const baseUrl = p.baseUrl?.trim() ?? '';
  if (baseUrl) {
    let url: URL | null = null;
    try { url = new URL(baseUrl); } catch { /* reported below */ }
    if (!url) errors.baseUrl = 'That is not a valid URL.';
    else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.baseUrl = 'Use an http:// or https:// URL.';
    }
  }

  if (providerNeedsKey({ apiType: p.apiType ?? 'openai-chat', baseUrl }) && !p.apiKey?.trim()) {
    errors.apiKey = 'A key is required unless you set a base URL.';
  }

  if (!p.models?.some(m => m.trim())) errors.models = 'Add at least one model.';

  return errors;
}

/** Trim, drop blanks and de-duplicate a model list while keeping order. */
export function normaliseModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of models) {
    const m = raw.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/** The base URL to actually call, with any trailing slash removed so adapters
 * can append '/chat/completions' without producing a double slash. */
export function resolveBaseUrl(p: Provider): string {
  const raw = p.baseUrl?.trim() || DEFAULT_BASE_URL[p.apiType];
  return raw.replace(/\/+$/, '');
}

function isProvider(v: unknown): v is Provider {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    (p.apiType === 'anthropic' || p.apiType === 'openai-chat') &&
    Array.isArray(p.models) &&
    p.models.every(m => typeof m === 'string')
  );
}

/** Pre-provider assistant settings: one Anthropic key and one model id. */
const LEGACY_KEY = 'bbd-planner-claude-key';
const LEGACY_MODEL = 'bbd-planner-claude-model';

/**
 * Fold the old single-key assistant settings into the registry.
 *
 * The panel used to assume Anthropic and stored one key plus one model id.
 * That pair becomes an ordinary "Anthropic" provider, pre-built and
 * pre-selected, so someone who already had the assistant working is never
 * asked to paste their key again.
 *
 * This lives here, and is called by loadProviders() rather than from the
 * app's startup migration, because the store reads the registry at module
 * scope — i.e. at import time, before any function in main.tsx runs. Any
 * migration placed at startup writes storage that the store has already read
 * past, which surfaces as a returning user being told to add a provider while
 * their migrated key sits correctly in localStorage. Running it at the point
 * of read makes import order irrelevant. Idempotent: the legacy keys are
 * removed once folded in.
 */
function migrateSingleKeyAssistant(): void {
  try {
    const apiKey = localStorage.getItem(LEGACY_KEY);
    if (apiKey === null) return;

    // Someone who already has a registry is past this migration; drop the
    // stale key rather than appending a duplicate provider.
    if (localStorage.getItem(PROVIDERS_STORAGE) === null) {
      const model = localStorage.getItem(LEGACY_MODEL);
      // Keep the stored model even if it has since dropped off the suggested
      // list — it was working for this user, and the list is only a starting
      // point they can edit.
      const models = model && !ANTHROPIC_SUGGESTED_MODELS.includes(model)
        ? [model, ...ANTHROPIC_SUGGESTED_MODELS]
        : [...ANTHROPIC_SUGGESTED_MODELS];

      const provider: Provider = {
        id: crypto.randomUUID(),
        name: 'Anthropic',
        apiType: 'anthropic',
        apiKey,
        models,
      };
      localStorage.setItem(PROVIDERS_STORAGE, JSON.stringify([provider]));
      localStorage.setItem(ACTIVE_STORAGE, JSON.stringify({
        providerId: provider.id,
        model: model && models.includes(model) ? model : models[0],
      }));
    }

    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_MODEL);
  } catch { /* storage unavailable — nothing to migrate */ }
}

export function loadProviders(): Provider[] {
  migrateSingleKeyAssistant();
  try {
    const raw = localStorage.getItem(PROVIDERS_STORAGE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Drop anything malformed rather than throwing — a corrupt entry should
    // cost the user one provider, not the whole panel.
    return Array.isArray(parsed) ? parsed.filter(isProvider) : [];
  } catch {
    return [];
  }
}

export function saveProviders(providers: Provider[]): void {
  try {
    localStorage.setItem(PROVIDERS_STORAGE, JSON.stringify(providers));
  } catch { /* private browsing / quota — the session still works in memory */ }
}

/** Stored choice, dropped if it points at a provider or model that no longer
 * exists (deleted provider, edited model list). */
export function loadActive(providers: Provider[]): ActiveChoice | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveChoice>;
    if (typeof parsed?.providerId !== 'string' || typeof parsed?.model !== 'string') return null;
    const provider = providers.find(p => p.id === parsed.providerId);
    if (!provider || !provider.models.includes(parsed.model)) return null;
    return { providerId: parsed.providerId, model: parsed.model };
  } catch {
    return null;
  }
}

export function saveActive(active: ActiveChoice | null): void {
  try {
    if (active) localStorage.setItem(ACTIVE_STORAGE, JSON.stringify(active));
    else localStorage.removeItem(ACTIVE_STORAGE);
  } catch { /* ignore */ }
}

/** First usable choice in the list — used after a delete, or on first load
 * when nothing was stored. */
export function firstChoice(providers: Provider[]): ActiveChoice | null {
  for (const p of providers) {
    if (p.models.length) return { providerId: p.id, model: p.models[0] };
  }
  return null;
}
