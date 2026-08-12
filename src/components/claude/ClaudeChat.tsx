import { useEffect, useRef, useState } from 'react';
import { CLAUDE_MODEL_OPTIONS, looksLikeApiKey } from '../../claude/claudeClient';
import type { PendingProposal } from '../../claude/useClaudeStore';
import { useClaudeStore } from '../../claude/useClaudeStore';

/** How much of the live thinking narrative to show while streaming. */
const THINKING_TAIL_CHARS = 280;

function KeyForm() {
  const setApiKey = useClaudeStore(s => s.setApiKey);
  const error = useClaudeStore(s => s.error);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    if (!looksLikeApiKey(draft)) {
      setInvalid(true);
      return;
    }
    setApiKey(draft);
  };

  return (
    <div className="teach-state claude-key-form">
      <span className="kicker">Plan with Claude</span>
      <p>
        Bring your own Anthropic API key to let Claude draft indicative plans
        from a rough brief. Create one at console.anthropic.com.
      </p>
      {error && <p className="claude-key-error">{error}</p>}
      <input
        type="password"
        placeholder="sk-ant-…"
        value={draft}
        autoComplete="off"
        onChange={e => { setDraft(e.target.value); setInvalid(false); }}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
      />
      {invalid && <p className="claude-key-error">That doesn't look like an Anthropic API key.</p>}
      <button className="btn-primary" onClick={save} disabled={!draft.trim()}>
        Save key
      </button>
      <p className="teach-state-note">Stored only in this browser — never in plan files.</p>
    </div>
  );
}

function ProposalCard({ pending }: { pending: PendingProposal }) {
  const applyPending = useClaudeStore(s => s.applyPending);
  const discardPending = useClaudeStore(s => s.discardPending);
  const { diff, warnings } = pending;

  const chips: string[] = [];
  if (diff.addedProjects.length) chips.push(`+${diff.addedProjects.length} project${diff.addedProjects.length > 1 ? 's' : ''}`);
  if (diff.modifiedProjects.length) chips.push(`${diff.modifiedProjects.length} updated`);
  if (diff.phaseCount) chips.push(`${diff.phaseCount} phase${diff.phaseCount > 1 ? 's' : ''}`);
  if (diff.milestoneCount) chips.push(`${diff.milestoneCount} milestone${diff.milestoneCount > 1 ? 's' : ''}`);
  if (diff.addedPeople.length) chips.push(`+${diff.addedPeople.length} people`);
  if (diff.addedTeams.length) chips.push(`+${diff.addedTeams.length} team${diff.addedTeams.length > 1 ? 's' : ''}`);
  if (diff.timelineChange) chips.push(diff.timelineChange);

  const removals = [
    ...diff.removedProjects.map(n => `project "${n}"`),
    ...diff.removedPeople.map(n => `person "${n}"`),
    ...diff.removedTeams.map(n => `team "${n}"`),
  ];

  return (
    <div className="claude-proposal">
      <span className="eyebrow">Proposed plan</span>
      {chips.length > 0 && (
        <div className="claude-diff-chips">
          {chips.map(c => <span key={c} className="claude-diff-chip">{c}</span>)}
        </div>
      )}
      {removals.length > 0 && (
        <div className="claude-diff-removals">
          ⚠ Applying will remove {removals.join(', ')}.
        </div>
      )}
      {warnings.map(w => <div key={w} className="claude-warning">{w}</div>)}
      <div className="claude-proposal-actions">
        <button className="btn-primary" onClick={applyPending}>Apply plan</button>
        <button className="btn-quiet" onClick={discardPending}>Discard</button>
      </div>
    </div>
  );
}

function StreamingRow() {
  const thinkingText = useClaudeStore(s => s.thinkingText);
  const progressChars = useClaudeStore(s => s.progressChars);
  const streamStartedAt = useClaudeStore(s => s.streamStartedAt);
  const cancel = useClaudeStore(s => s.cancel);

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
    <div className="claude-streaming">
      {tail && <div className="claude-thinking">{tail}</div>}
      <div className="claude-stream-row">
        <span className="claude-stream-pulse" aria-hidden="true" />
        <span>{label}</span>
        <button className="btn-secondary claude-stop-btn" onClick={cancel}>Stop</button>
      </div>
      {elapsedSec > 45 && (
        <div className="claude-stream-note">
          Still working — big plans take a couple of minutes. The size counter
          shows the draft growing.
        </div>
      )}
    </div>
  );
}

export default function ClaudeChat() {
  const apiKey = useClaudeStore(s => s.apiKey);
  const messages = useClaudeStore(s => s.messages);
  const status = useClaudeStore(s => s.status);
  const pending = useClaudeStore(s => s.pending);
  const send = useClaudeStore(s => s.send);
  const clearApiKey = useClaudeStore(s => s.clearApiKey);

  const model = useClaudeStore(s => s.model);
  const setModel = useClaudeStore(s => s.setModel);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const streaming = status === 'streaming';

  // Keep the newest content in view as messages/thinking/proposals arrive.
  const thinkingLen = useClaudeStore(s => s.thinkingText.length);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, streaming, thinkingLen]);

  if (!apiKey) return <KeyForm />;

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    void send(text);
  };

  return (
    <div className="claude-chat-root">
      <div className="claude-chat" ref={listRef}>
        {messages.length === 0 && !streaming && (
          <div className="teach-state">
            <span className="kicker">Plan with Claude</span>
            <p>
              Describe the work in rough terms — project names, target dates,
              who's on it, what it covers — and Claude drafts an indicative
              plan you can review before it touches anything.
            </p>
            <p className="teach-state-note">
              e.g. "New project Payments Revamp, Oct–Dec, Alice (BA) and Bob
              (dev): card vault, 3DS, settlement reports."
            </p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`claude-msg ${m.role}${m.isError ? ' is-error' : ''}`}>
            {m.text}
            {m.applied && <div className="claude-msg-applied">✓ Applied — Ctrl+Z to undo</div>}
          </div>
        ))}
        {pending && <ProposalCard pending={pending} />}
        {streaming && <StreamingRow />}
      </div>
      <div className="claude-composer">
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
        <div className="claude-composer-row">
          <select
            className="claude-model-select"
            value={model}
            disabled={streaming}
            onChange={e => setModel(e.target.value)}
            title="Model used for generation (your key, your cost)"
            aria-label="Model"
          >
            {CLAUDE_MODEL_OPTIONS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button className="btn-quiet claude-key-link" onClick={clearApiKey} title="Forget the stored key and enter a new one">
            Change key
          </button>
          <span className="claude-composer-hint">Ctrl+Enter to send</span>
          <button className="btn-primary" onClick={submit} disabled={streaming || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
