import { useEffect, useRef, useState } from 'react';
import { EFFORT_OPTIONS, JSON_MODE_LABEL } from '../../ai/aiClient';
import type { Effort } from '../../ai/aiClient';
import type { PendingProposal } from '../../ai/useAssistantStore';
import { activeProvider, useAssistantStore } from '../../ai/useAssistantStore';
import AiProviderModal from './AiProviderModal';

/** How close to the bottom still counts as "following along", in px. Anything
 * further up is treated as the user having deliberately scrolled back. */
const STICK_THRESHOLD = 24;

/**
 * Keep a scroller pinned to the bottom as content streams in — but only while
 * the user is actually at the bottom.
 *
 * The panel used to force `scrollTop = scrollHeight` on every reasoning delta.
 * Deltas land many times a second, so scrolling up to read an earlier reply
 * snapped you straight back down before you could read it: the transcript was
 * there the whole time and simply could not be looked at.
 */
function useStickToBottom(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
  };

  useEffect(() => {
    const el = ref.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const jumpToLatest = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setPinned(true);
  };

  return { ref, onScroll, pinned, jumpToLatest };
}

/** Shown until the user has registered somewhere to send requests. */
function NoProviderState() {
  const toggleSettings = useAssistantStore(s => s.toggleSettings);
  return (
    <div className="teach-state assistant-setup">
      <span className="kicker">Plan with AI</span>
      <p>
        Connect a language model to draft indicative plans from a rough brief.
        Bring your own endpoint — Anthropic, OpenAI, your company's gateway, or
        a model running on your own machine.
      </p>
      <button className="btn-primary" onClick={() => toggleSettings(true)}>
        Add a provider
      </button>
      <p className="teach-state-note">
        Keys are stored only in this browser — never in plan files.
      </p>
    </div>
  );
}

function ProposalCard({ pending }: { pending: PendingProposal }) {
  const applyPending = useAssistantStore(s => s.applyPending);
  const discardPending = useAssistantStore(s => s.discardPending);
  const { diff, warnings } = pending;

  const chips: string[] = [];
  if (diff.addedProjects.length) chips.push(`+${diff.addedProjects.length} project${diff.addedProjects.length > 1 ? 's' : ''}`);
  if (diff.modifiedProjects.length) chips.push(`${diff.modifiedProjects.length} updated`);
  if (diff.phaseCount) chips.push(`${diff.phaseCount} phase${diff.phaseCount > 1 ? 's' : ''}`);
  if (diff.milestoneCount) chips.push(`${diff.milestoneCount} milestone${diff.milestoneCount > 1 ? 's' : ''}`);
  if (diff.dependencyCount) chips.push(`${diff.dependencyCount} dependenc${diff.dependencyCount > 1 ? 'ies' : 'y'}`);
  if (diff.addedPeople.length) chips.push(`+${diff.addedPeople.length} people`);
  if (diff.addedTeams.length) chips.push(`+${diff.addedTeams.length} team${diff.addedTeams.length > 1 ? 's' : ''}`);
  if (diff.timelineChange) chips.push(diff.timelineChange);

  const removals = [
    ...diff.removedProjects.map(n => `project "${n}"`),
    ...diff.removedPeople.map(n => `person "${n}"`),
    ...diff.removedTeams.map(n => `team "${n}"`),
  ];

  return (
    <div className="assistant-proposal">
      <span className="eyebrow">Proposed plan</span>
      {chips.length > 0 && (
        <div className="assistant-diff-chips">
          {chips.map(c => <span key={c} className="assistant-diff-chip">{c}</span>)}
        </div>
      )}
      {removals.length > 0 && (
        <div className="assistant-diff-removals">
          ⚠ Applying will remove {removals.join(', ')}.
        </div>
      )}
      {warnings.map(w => <div key={w} className="assistant-warning">{w}</div>)}
      <div className="assistant-proposal-actions">
        <button className="btn-primary" onClick={applyPending}>Apply plan</button>
        <button className="btn-quiet" onClick={discardPending}>Discard</button>
      </div>
    </div>
  );
}

/** The model's reasoning, in full and scrollable. Used live while streaming
 * and again behind a disclosure once the turn has finished. */
function Reasoning({ text, live }: { text: string; live?: boolean }) {
  const { ref, onScroll } = useStickToBottom([live ? text.length : 0]);
  return (
    <div className="assistant-thinking" ref={ref} onScroll={onScroll}>
      {text}
    </div>
  );
}

function StreamingRow() {
  const thinkingText = useAssistantStore(s => s.thinkingText);
  const progressChars = useAssistantStore(s => s.progressChars);
  const streamStartedAt = useAssistantStore(s => s.streamStartedAt);
  const cancel = useAssistantStore(s => s.cancel);

  // Tick once a second so the elapsed time visibly proves the run is alive.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedSec = streamStartedAt ? Math.max(0, Math.floor((now - streamStartedAt) / 1000)) : 0;
  const elapsed = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;

  const label = progressChars > 0
    ? `Drafting plan… ${(progressChars / 1024).toFixed(1)} KB · ${elapsed}`
    : `Thinking… ${elapsed}`;

  return (
    <div className="assistant-streaming">
      {/* The whole narrative, not its last 280 characters — the tail clamp
          threw away most of what the model said and could not be scrolled. */}
      {thinkingText && <Reasoning text={thinkingText} live />}
      <div className="assistant-stream-row">
        <span className="assistant-stream-pulse" aria-hidden="true" />
        <span>{label}</span>
        <button className="btn-secondary assistant-stop-btn" onClick={cancel}>Stop</button>
      </div>
      {elapsedSec > 45 && (
        <div className="assistant-stream-note">
          Still working — big plans take a couple of minutes. The size counter
          shows the draft growing.
        </div>
      )}
    </div>
  );
}

export default function AssistantChat() {
  const providers = useAssistantStore(s => s.providers);
  const active = useAssistantStore(s => s.active);
  const provider = useAssistantStore(s => activeProvider(s));
  const messages = useAssistantStore(s => s.messages);
  const status = useAssistantStore(s => s.status);
  const pending = useAssistantStore(s => s.pending);
  const jsonMode = useAssistantStore(s => s.jsonMode);
  const send = useAssistantStore(s => s.send);
  const effort = useAssistantStore(s => s.effort);
  const setEffort = useAssistantStore(s => s.setEffort);
  const setActive = useAssistantStore(s => s.setActive);
  const settingsOpen = useAssistantStore(s => s.settingsOpen);
  const toggleSettings = useAssistantStore(s => s.toggleSettings);

  const [draft, setDraft] = useState('');

  const streaming = status === 'streaming';

  // Follow new content only while the user is at the bottom, so scrolling back
  // through the transcript is not fought by every incoming delta.
  const thinkingLen = useAssistantStore(s => s.thinkingText.length);
  const { ref: listRef, onScroll, pinned, jumpToLatest } =
    useStickToBottom([messages.length, pending, streaming, thinkingLen]);

  if (!provider || !active) {
    return (
      <>
        <NoProviderState />
        {settingsOpen && <AiProviderModal />}
      </>
    );
  }

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    void send(text);
  };

  return (
    <div className="assistant-chat-root">
      <div className="assistant-chat" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && !streaming && (
          <div className="teach-state">
            <span className="kicker">Plan with AI</span>
            <p>
              Describe the work in rough terms — project names, target dates,
              who's on it, what it covers — and {provider.name} drafts an
              indicative plan you can review before it touches anything.
            </p>
            <p className="teach-state-note">
              e.g. "New project Payments Revamp, Oct–Dec, Alice (BA) and Bob
              (dev): card vault, 3DS, settlement reports."
            </p>
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            className={`assistant-msg ${m.role}${m.isError ? ' is-error' : ''}${m.isNotice ? ' is-notice' : ''}`}
          >
            {m.text}
            {m.thinking && (
              // Collapsed by default: the summary is the reply, the reasoning
              // is there for when you want to check how it got there.
              <details className="assistant-reasoning">
                <summary>Show reasoning</summary>
                <Reasoning text={m.thinking} />
              </details>
            )}
            {m.applied && <div className="assistant-msg-applied">✓ Applied — Ctrl+Z to undo</div>}
          </div>
        ))}
        {pending && <ProposalCard pending={pending} />}
        {streaming && <StreamingRow />}
      </div>
      {!pinned && (
        <button className="assistant-jump-latest" onClick={jumpToLatest}>
          ↓ Jump to latest
        </button>
      )}
      <div className="assistant-composer">
        <textarea
          value={draft}
          placeholder="Describe projects, dates, people…"
          disabled={streaming}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="assistant-composer-row">
          <select
            className="assistant-model-select"
            value={`${active.providerId}::${active.model}`}
            disabled={streaming}
            onChange={e => {
              const [providerId, model] = e.target.value.split('::');
              setActive({ providerId, model });
            }}
            title="Provider and model used for generation (your key, your cost)"
            aria-label="Provider and model"
          >
            {providers.map(p => (
              <optgroup key={p.id} label={p.name}>
                {p.models.map(m => (
                  <option key={m} value={`${p.id}::${m}`}>{m}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* Anthropic's effort levels. Other wire formats have no portable
              equivalent, so the control is hidden rather than shown inert. */}
          {provider.apiType === 'anthropic' && (
            <select
              className="assistant-effort-select"
              value={effort}
              disabled={streaming}
              onChange={e => setEffort(e.target.value as Effort)}
              title={EFFORT_OPTIONS.find(o => o.id === effort)?.hint}
              aria-label="Effort"
            >
              {EFFORT_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          )}
          <button
            className="btn-quiet assistant-providers-link"
            onClick={() => toggleSettings(true)}
            title="Add, edit or remove language model providers"
          >
            Providers…
          </button>
          {/* Only worth surfacing when the endpoint could not enforce the
              schema — that is the case where replies get flaky, and knowing
              why saves blaming the model. */}
          {jsonMode && jsonMode !== 'schema' && (
            <span className="assistant-json-mode" title="This endpoint could not enforce the plan schema, so replies are checked and repaired locally.">
              {JSON_MODE_LABEL[jsonMode]}
            </span>
          )}
          <span className="assistant-composer-hint">Ctrl+Enter to send</span>
          <button className="btn-primary" onClick={submit} disabled={streaming || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
      {settingsOpen && <AiProviderModal />}
    </div>
  );
}
