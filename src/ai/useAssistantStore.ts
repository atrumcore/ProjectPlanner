/**
 * Session state for the AI assistant panel — a standalone store (same
 * precedent as useAuthStore) so chat state never enters the document store's
 * undo snapshots or localStorage autosave. Persisted: the provider registry
 * and the active provider/model choice. Not persisted: the conversation.
 */

import { create } from 'zustand';
import { useGanttStore } from '../store/useGanttStore';
import { describeProviderFailure, generatePlan, makeUserTurn } from './aiClient';
import type { JsonMode, ProviderTurn } from './aiClient';
import {
  firstChoice, loadActive, loadProviders, normaliseModels, saveActive, saveProviders,
} from './providers';
import type { ActiveChoice, Provider } from './providers';
import { aiPlanToDoc, docToAiPlan } from './skill/aiPlanConvert';
import type { ExportedDoc, PlanDiff } from './skill/aiPlanConvert';
import type { AiPlanDoc } from './skill/aiPlan';

const uid = () => crypto.randomUUID();

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Assistant messages: proposal from this turn was applied to the plan. */
  applied?: boolean;
  /** Assistant messages: this is an error notice, not a model reply. */
  isError?: boolean;
  /** Neither role: a panel notice, e.g. the provider changed. */
  isNotice?: boolean;
}

export interface PendingProposal {
  /** The returned end-state (converted fresh against the live document at
   * apply time, so mid-stream edits to untouched subsystems survive). */
  plan: AiPlanDoc;
  diff: PlanDiff;
  warnings: string[];
  /** id of the assistant chat message this proposal belongs to. */
  messageId: string;
}

interface AssistantState {
  providers: Provider[];
  active: ActiveChoice | null;
  messages: ChatMessage[];
  /** Verbatim API turns, replayed so the conversation prefix stays
   * cache-valid. Cleared whenever the active provider changes. */
  history: ProviderTurn[];
  status: 'idle' | 'streaming';
  /** Epoch ms when the in-flight request started (null when idle). */
  streamStartedAt: number | null;
  thinkingText: string;
  progressChars: number;
  /** JSON strictness the last successful turn negotiated, shown in the
   * composer so a flaky endpoint explains itself. */
  jsonMode: JsonMode | null;
  pending: PendingProposal | null;
  /** Panel-level error (also mirrored as an assistant error message). */
  error: string | null;
  abort: AbortController | null;
  /** Whether the provider settings dialog is open. */
  settingsOpen: boolean;

  addProvider: (p: Omit<Provider, 'id'>) => string;
  updateProvider: (id: string, patch: Partial<Omit<Provider, 'id'>>) => void;
  removeProvider: (id: string) => void;
  setActive: (choice: ActiveChoice) => void;
  toggleSettings: (open?: boolean) => void;

  send: (text: string) => Promise<void>;
  cancel: () => void;
  applyPending: () => void;
  discardPending: () => void;
  clearChat: () => void;
}

/** The provider the active choice points at, or null. */
export function activeProvider(s: Pick<AssistantState, 'providers' | 'active'>): Provider | null {
  if (!s.active) return null;
  return s.providers.find(p => p.id === s.active!.providerId) ?? null;
}

const initialProviders = loadProviders();

export const useAssistantStore = create<AssistantState>((set, get) => ({
  providers: initialProviders,
  active: loadActive(initialProviders) ?? firstChoice(initialProviders),
  messages: [],
  history: [],
  status: 'idle',
  streamStartedAt: null,
  thinkingText: '',
  progressChars: 0,
  jsonMode: null,
  pending: null,
  error: null,
  abort: null,
  settingsOpen: false,

  addProvider: (p) => {
    const provider: Provider = { ...p, id: uid(), models: normaliseModels(p.models) };
    set(s => {
      const providers = [...s.providers, provider];
      saveProviders(providers);
      // First provider added becomes active, so the panel is usable straight
      // away rather than needing a separate selection step.
      const active = s.active ?? firstChoice(providers);
      saveActive(active);
      return { providers, active, error: null };
    });
    return provider.id;
  },

  updateProvider: (id, patch) => {
    set(s => {
      const providers = s.providers.map(p =>
        p.id === id
          ? { ...p, ...patch, ...(patch.models ? { models: normaliseModels(patch.models) } : {}) }
          : p,
      );
      saveProviders(providers);
      // An edit can remove the model that was selected; fall back rather than
      // leaving the composer pointing at something that no longer exists.
      let active = s.active;
      if (active?.providerId === id) {
        const provider = providers.find(p => p.id === id);
        if (!provider?.models.includes(active.model)) {
          active = provider?.models.length ? { providerId: id, model: provider.models[0] } : firstChoice(providers);
          saveActive(active);
        }
      }
      return { providers, active };
    });
  },

  removeProvider: (id) => {
    set(s => {
      const providers = s.providers.filter(p => p.id !== id);
      saveProviders(providers);
      if (s.active?.providerId !== id) return { providers };
      const active = firstChoice(providers);
      saveActive(active);
      // The conversation belonged to the deleted provider.
      s.abort?.abort();
      return {
        providers, active,
        messages: [], history: [], pending: null, jsonMode: null,
        status: 'idle' as const, streamStartedAt: null, abort: null,
      };
    });
  },

  setActive: (choice) => {
    const { active } = get();
    const providerChanged = active?.providerId !== choice.providerId;
    saveActive(choice);
    if (!providerChanged) {
      set({ active: choice });
      return;
    }
    // Turn formats are not portable — Anthropic assistant turns carry
    // thinking blocks that another endpoint will reject outright. Replaying
    // them would surface as a 400 that looks like the user's new endpoint is
    // broken, so the conversation ends with the provider that produced it.
    get().abort?.abort();
    const name = get().providers.find(p => p.id === choice.providerId)?.name ?? 'the new provider';
    set(s => ({
      active: choice,
      history: [],
      pending: null,
      jsonMode: null,
      status: 'idle',
      streamStartedAt: null,
      abort: null,
      thinkingText: '',
      progressChars: 0,
      messages: s.messages.length
        ? [...s.messages, {
            id: uid(), role: 'assistant' as const, isNotice: true,
            text: `Switched to ${name}. Earlier turns aren't carried over — this is a fresh conversation.`,
          }]
        : s.messages,
    }));
  },

  toggleSettings: (open) => set(s => ({ settingsOpen: open ?? !s.settingsOpen })),

  send: async (text) => {
    const state = get();
    const provider = activeProvider(state);
    const request = text.trim();
    if (!provider || !state.active || !request || state.status === 'streaming') return;

    const abort = new AbortController();
    set(s => ({
      status: 'streaming',
      streamStartedAt: Date.now(),
      error: null,
      thinkingText: '',
      progressChars: 0,
      pending: null, // a new request supersedes any unapplied proposal
      abort,
      messages: [...s.messages, { id: uid(), role: 'user', text: request }],
    }));

    // Snapshot the document as the model will see it for this turn.
    const baseDoc = JSON.parse(useGanttStore.getState().exportToJSON()) as ExportedDoc;
    const userContent = makeUserTurn(JSON.stringify(docToAiPlan(baseDoc)), request);

    try {
      const result = await generatePlan({
        provider,
        model: state.active.model,
        history: state.history,
        userContent,
        onThinking: (delta) => set(s => ({ thinkingText: s.thinkingText + delta })),
        onProgress: (totalChars) => set({ progressChars: totalChars }),
        signal: abort.signal,
      });

      const converted = aiPlanToDoc(result.response.plan, baseDoc);
      const messageId = uid();
      set(s => ({
        status: 'idle',
        streamStartedAt: null,
        abort: null,
        thinkingText: '',
        progressChars: 0,
        jsonMode: result.jsonMode ?? s.jsonMode,
        messages: [...s.messages, { id: messageId, role: 'assistant', text: result.response.summary }],
        history: [...s.history, result.userTurn, result.assistantTurn],
        pending: {
          plan: result.response.plan,
          diff: converted.diff,
          warnings: converted.warnings,
          messageId,
        },
      }));
    } catch (err) {
      const failure = describeProviderFailure(err, provider);
      if (failure.kind === 'aborted') {
        set({ status: 'idle', streamStartedAt: null, abort: null, thinkingText: '', progressChars: 0 });
        return;
      }
      if (failure.kind === 'auth') {
        // Open the dialog on the offending provider rather than silently
        // discarding the key the way the single-key panel used to.
        set({ settingsOpen: true });
      }
      set(s => ({
        status: 'idle',
        streamStartedAt: null,
        abort: null,
        thinkingText: '',
        progressChars: 0,
        error: failure.message,
        messages: [...s.messages, { id: uid(), role: 'assistant', text: failure.message, isError: true }],
      }));
    }
  },

  cancel: () => {
    get().abort?.abort();
  },

  applyPending: () => {
    const { pending } = get();
    if (!pending) return;
    const gantt = useGanttStore.getState();
    // Re-convert against the live document so anything the model never sees
    // (notes, open items, environments, view prefs) reflects edits made while
    // the plan was generating. The lanes/bars end-state is the model's.
    const currentDoc = JSON.parse(gantt.exportToJSON()) as ExportedDoc;
    const { docJson } = aiPlanToDoc(pending.plan, currentDoc);
    gantt.importFromJSON(docJson); // validates, pushes undo, re-renders
    // importFromJSON clears the dirty flag (it's built for file opens); an
    // AI edit is unsaved work, so re-flag it.
    useGanttStore.setState({ isDirty: true });
    set(s => ({
      pending: null,
      messages: s.messages.map(m => m.id === pending.messageId ? { ...m, applied: true } : m),
    }));
  },

  discardPending: () => set({ pending: null }),

  clearChat: () => {
    get().abort?.abort();
    set({
      messages: [], history: [], pending: null, error: null,
      thinkingText: '', progressChars: 0, status: 'idle', streamStartedAt: null, abort: null,
    });
  },
}));

// Dev-only: expose the store for browser-automation testing (never in builds).
if (import.meta.env.DEV) {
  (window as unknown as { __assistantStore?: typeof useAssistantStore }).__assistantStore = useAssistantStore;
}
