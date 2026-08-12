/**
 * Session state for the Claude assistant panel — a standalone store (same
 * precedent as useAuthStore) so chat state never enters the document store's
 * undo snapshots or localStorage autosave. Nothing here is persisted except
 * the API key (localStorage) and the panel width (owned by ClaudePanel).
 */

import { create } from 'zustand';
import { useGanttStore } from '../store/useGanttStore';
import {
  DEFAULT_MODEL, describeClaudeFailure, generatePlan, isKnownModel, makeUserTurn,
} from './claudeClient';
import type { ChatTurn } from './claudeClient';
import { aiPlanToDoc, docToAiPlan } from './skill/aiPlanConvert';
import type { ExportedDoc, PlanDiff } from './skill/aiPlanConvert';
import type { AiPlanDoc } from './skill/aiPlan';

const KEY_STORAGE = 'bbd-planner-claude-key';
const MODEL_STORAGE = 'bbd-planner-claude-model';

const uid = () => crypto.randomUUID();

function loadApiKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}

/** Stored model choice, falling back to the default when absent or when the
 * stored id is no longer in the offered list. */
function loadModel(): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE);
    if (stored && isKnownModel(stored)) return stored;
  } catch { /* ignore */ }
  return DEFAULT_MODEL;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Assistant messages: proposal from this turn was applied to the plan. */
  applied?: boolean;
  /** Assistant messages: this is an error notice, not a model reply. */
  isError?: boolean;
}

export interface PendingProposal {
  /** Claude's returned end-state (converted fresh against the live document
   * at apply time, so mid-stream edits to untouched subsystems survive). */
  plan: AiPlanDoc;
  diff: PlanDiff;
  warnings: string[];
  /** id of the assistant chat message this proposal belongs to. */
  messageId: string;
}

interface ClaudeState {
  apiKey: string | null;
  /** Model id used for generation (persisted per browser). */
  model: string;
  messages: ChatMessage[];
  /** Verbatim API turns (assistant turns include thinking blocks) — replayed
   * on every request so the conversation prefix stays cache-valid. */
  history: ChatTurn[];
  status: 'idle' | 'streaming';
  /** Epoch ms when the in-flight request started (null when idle). */
  streamStartedAt: number | null;
  thinkingText: string;
  progressChars: number;
  pending: PendingProposal | null;
  /** Panel-level error (also mirrored as an assistant error message). */
  error: string | null;
  abort: AbortController | null;

  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setModel: (id: string) => void;
  send: (text: string) => Promise<void>;
  cancel: () => void;
  applyPending: () => void;
  discardPending: () => void;
  clearChat: () => void;
}

export const useClaudeStore = create<ClaudeState>((set, get) => ({
  apiKey: loadApiKey(),
  model: loadModel(),
  messages: [],
  history: [],
  status: 'idle',
  streamStartedAt: null,
  thinkingText: '',
  progressChars: 0,
  pending: null,
  error: null,
  abort: null,

  setApiKey: (key) => {
    const trimmed = key.trim();
    try { localStorage.setItem(KEY_STORAGE, trimmed); } catch { /* ignore */ }
    set({ apiKey: trimmed, error: null });
  },

  clearApiKey: () => {
    try { localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
    set({ apiKey: null });
  },

  setModel: (id) => {
    if (!isKnownModel(id)) return;
    try { localStorage.setItem(MODEL_STORAGE, id); } catch { /* ignore */ }
    set({ model: id });
  },

  send: async (text) => {
    const { apiKey, model, status, history } = get();
    const request = text.trim();
    if (!apiKey || !request || status === 'streaming') return;

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

    // Snapshot the document as Claude will see it for this turn.
    const baseDoc = JSON.parse(useGanttStore.getState().exportToJSON()) as ExportedDoc;
    const userContent = makeUserTurn(JSON.stringify(docToAiPlan(baseDoc)), request);

    try {
      const result = await generatePlan({
        apiKey,
        model,
        history,
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
      const failure = describeClaudeFailure(err);
      if (failure.kind === 'aborted') {
        set({ status: 'idle', streamStartedAt: null, abort: null, thinkingText: '', progressChars: 0 });
        return;
      }
      if (failure.kind === 'auth') {
        get().clearApiKey(); // force the key form back open, with the error shown
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
    // Re-convert against the live document so anything Claude never sees
    // (notes, action items, environments, view prefs) reflects edits made
    // while the plan was generating. The lanes/bars end-state is Claude's.
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
  (window as unknown as { __claudeStore?: typeof useClaudeStore }).__claudeStore = useClaudeStore;
}
