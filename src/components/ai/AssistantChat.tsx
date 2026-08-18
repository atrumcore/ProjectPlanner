import { useEffect, useRef, useState } from 'react';
import { JSON_MODE_LABEL } from '../../ai/aiClient';
import type { PendingProposal } from '../../ai/useAssistantStore';
import { activeProvider, useAssistantStore } from '../../ai/useAssistantStore';
import AiProviderModal from './AiProviderModal';

/** How much of the live thinking narrative to show while streaming. */
const THINKING_TAIL_CHARS = 280;

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

  const tail = thinkingText.slice(-THINKING_TAIL_CHARS);
  const label = progressChars > 0
    ? `Drafting plan… ${(progressChars / 1024).toFixed(1)} KB · ${elapsed}`
    : `Thinking… ${elapsed}`;

  return (
    <div className="assistant-streaming">
      {tail && <div className="assistant-thinking">{tail}</div>}
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
  const setActive = useAssistantStore(s => s.setActive);
  const settingsOpen = useAssistantStore(s => s.settingsOpen);
  const toggleSettings = useAssistantStore(s => s.toggleSettings);

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const streaming = status === 'streaming';

  // Keep the newest content in view as messages/thinking/proposals arrive.
  const thinkingLen = useAssistantStore(s => s.thinkingText.length);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, streaming, thinkingLen]);

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
      <div className="assistant-chat" ref={listRef}>
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
            {m.applied && <div className="assistant-msg-applied">✓ Applied — Ctrl+Z to undo</div>}
          </div>
        ))}
        {pending && <ProposalCard pending={pending} />}
        {streaming && <StreamingRow />}
      </div>
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
