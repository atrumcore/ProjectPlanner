import { useEffect, useMemo, useRef, useState } from 'react';
import { useAssistantStore } from '../../ai/useAssistantStore';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import {
  ANTHROPIC_SUGGESTED_MODELS, API_TYPE_OPTIONS, DEFAULT_BASE_URL,
  normaliseModels, providerNeedsKey, validateProvider,
} from '../../ai/providers';
import type { ApiType, Provider } from '../../ai/providers';
import { listAnthropicModels } from '../../ai/adapters/anthropic';
import { listOpenAiModels } from '../../ai/adapters/openaiChat';
import { describeProviderFailure } from '../../ai/aiClient';

/** The form's working copy — id absent until saved. */
type Draft = Omit<Provider, 'id'> & { id?: string };
type Field = 'name' | 'apiKey' | 'baseUrl' | 'models';

const emptyDraft = (): Draft => ({ name: '', apiType: 'openai-chat', apiKey: '', baseUrl: '', models: [] });

const anthropicDraft = (): Draft => ({
  name: 'Anthropic',
  apiType: 'anthropic',
  apiKey: '',
  baseUrl: '',
  models: [...ANTHROPIC_SUGGESTED_MODELS],
});

function Required() {
  return <span className="ai-provider-required" aria-hidden="true">*</span>;
}

function ProviderForm({ initial, onCancel, onSave }: {
  initial: Draft;
  onCancel: () => void;
  onSave: (d: Draft) => void;
}) {
  const providers = useAssistantStore(s => s.providers);
  const [draft, setDraft] = useState<Draft>(initial);
  const [modelText, setModelText] = useState(initial.models.join('\n'));
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<{ ok: boolean; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const models = useMemo(() => normaliseModels(modelText.split('\n')), [modelText]);
  const candidate: Draft = { ...draft, models };
  const errors = validateProvider(candidate, providers);
  const needsKey = providerNeedsKey(candidate);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const blur = (f: Field) => setTouched(t => ({ ...t, [f]: true }));
  // Report a field once the user has left it or tried to save — not while
  // they are still mid-way through typing it for the first time.
  const problem = (f: Field) => ((touched[f] || submitted) ? errors[f] : undefined);

  const fetchModels = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFetching(true);
    setFetchNote(null);
    try {
      const baseUrl = candidate.baseUrl?.trim() || DEFAULT_BASE_URL[candidate.apiType];
      const found = candidate.apiType === 'anthropic'
        ? await listAnthropicModels(candidate.apiKey ?? '', baseUrl, ctrl.signal)
        : await listOpenAiModels(candidate.apiKey, baseUrl, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!found.length) {
        setFetchNote({ ok: false, text: 'That endpoint listed no models. Type them in below instead.' });
        return;
      }
      setModelText(found.join('\n'));
      setFetchNote({ ok: true, text: `Found ${found.length} model${found.length === 1 ? '' : 's'}.` });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setFetchNote({ ok: false, text: describeProviderFailure(err).message });
    } finally {
      if (!ctrl.signal.aborted) setFetching(false);
    }
  };

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    onSave({ ...candidate, name: candidate.name.trim(), baseUrl: candidate.baseUrl?.trim() || undefined });
  };

  const apiType = API_TYPE_OPTIONS.find(o => o.id === draft.apiType);

  return (
    <>
      <div className="ai-provider-body">
        <div className="ai-provider-field">
          <label htmlFor="ai-provider-name">Provider name <Required /></label>
          <input
            id="ai-provider-name"
            value={draft.name}
            autoFocus
            placeholder="e.g. Work gateway"
            aria-invalid={!!problem('name')}
            onBlur={() => blur('name')}
            onChange={e => set('name', e.target.value)}
          />
          {problem('name') && <p className="ai-provider-error">{errors.name}</p>}
        </div>

        <div className="ai-provider-field">
          <label htmlFor="ai-provider-type">API type</label>
          <select
            id="ai-provider-type"
            value={draft.apiType}
            onChange={e => set('apiType', e.target.value as ApiType)}
          >
            {API_TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <p className="ai-provider-hint">{apiType?.hint}</p>
        </div>

        <div className="ai-provider-field">
          <label htmlFor="ai-provider-url">Base URL</label>
          <input
            id="ai-provider-url"
            value={draft.baseUrl ?? ''}
            placeholder={DEFAULT_BASE_URL[draft.apiType]}
            aria-invalid={!!problem('baseUrl')}
            onBlur={() => blur('baseUrl')}
            onChange={e => set('baseUrl', e.target.value)}
          />
          {problem('baseUrl')
            ? <p className="ai-provider-error">{errors.baseUrl}</p>
            : <p className="ai-provider-hint">Leave blank for {DEFAULT_BASE_URL[draft.apiType]}.</p>}
        </div>

        <div className="ai-provider-field">
          <label htmlFor="ai-provider-key">API key {needsKey && <Required />}</label>
          <input
            id="ai-provider-key"
            type="password"
            autoComplete="off"
            value={draft.apiKey ?? ''}
            placeholder={needsKey ? '' : 'Not needed for this host'}
            aria-invalid={!!problem('apiKey')}
            onBlur={() => blur('apiKey')}
            onChange={e => set('apiKey', e.target.value)}
          />
          {problem('apiKey')
            ? <p className="ai-provider-error">{errors.apiKey}</p>
            : !needsKey && <p className="ai-provider-hint">Optional — this host is reached by URL, so leave it blank if it needs no auth.</p>}
        </div>

        <div className="ai-provider-field">
          <div className="ai-provider-models-head">
            <label htmlFor="ai-provider-models">Models <Required /></label>
            <button className="btn-quiet" onClick={fetchModels} disabled={fetching}>
              {fetching ? 'Fetching…' : 'Fetch from endpoint'}
            </button>
          </div>
          <textarea
            id="ai-provider-models"
            rows={4}
            spellCheck={false}
            value={modelText}
            placeholder={'One id per line\ngpt-5.3\nllama3.1:70b'}
            aria-invalid={!!problem('models')}
            onBlur={() => blur('models')}
            onChange={e => setModelText(e.target.value)}
          />
          {fetchNote && (
            <p className={fetchNote.ok ? 'ai-provider-ok' : 'ai-provider-error'}>{fetchNote.text}</p>
          )}
          {problem('models') && <p className="ai-provider-error">{errors.models}</p>}
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}>
          {initial.id ? 'Save changes' : 'Add provider'}
        </button>
      </div>
    </>
  );
}

function ProviderList({ onAdd, onEdit }: { onAdd: (d: Draft) => void; onEdit: (p: Provider) => void }) {
  const providers = useAssistantStore(s => s.providers);
  const active = useAssistantStore(s => s.active);
  const removeProvider = useAssistantStore(s => s.removeProvider);
  const setActive = useAssistantStore(s => s.setActive);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Armed destructive confirms auto-disarm after 3s (v2 buttons card).
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);

  return (
    <div className="ai-provider-body">
      {providers.length === 0 && (
        <p className="ai-provider-hint">
          No providers yet. Add one to start planning with AI.
        </p>
      )}

      {providers.length > 0 && (
        <ul className="ai-provider-list">
          {providers.map(p => {
            const isActive = active?.providerId === p.id;
            const bits = [
              API_TYPE_OPTIONS.find(o => o.id === p.apiType)?.label,
              `${p.models.length} model${p.models.length === 1 ? '' : 's'}`,
              p.baseUrl,
              !providerNeedsKey(p) && !p.apiKey ? 'no key' : null,
            ].filter(Boolean);
            return (
              <li key={p.id} className={`ai-provider-row${isActive ? ' is-active' : ''}`}>
                <div className="ai-provider-row-main">
                  <span className="ai-provider-row-name">
                    {p.name}
                    {isActive && <span className="ai-provider-active-chip">In use</span>}
                  </span>
                  <span className="ai-provider-row-meta">{bits.join(' · ')}</span>
                </div>
                <button className="btn-quiet" onClick={() => onEdit(p)}>Edit</button>
                <button
                  className={`btn-quiet ai-provider-delete${confirmDeleteId === p.id ? ' confirm' : ''}`}
                  onClick={() => {
                    if (confirmDeleteId === p.id) { removeProvider(p.id); setConfirmDeleteId(null); }
                    else setConfirmDeleteId(p.id);
                  }}
                >
                  {confirmDeleteId === p.id ? 'Confirm' : 'Remove'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="ai-provider-add-row">
        <button className="btn-secondary" onClick={() => onAdd(emptyDraft())}>
          Add custom endpoint
        </button>
        {!providers.some(p => p.apiType === 'anthropic') && (
          <button className="btn-secondary" onClick={() => onAdd(anthropicDraft())}>
            Add Anthropic
          </button>
        )}
      </div>

      {providers.length > 1 && active && (
        <div className="ai-provider-field ai-provider-switch">
          <label htmlFor="ai-provider-switch-select">Use for new requests</label>
          <select
            id="ai-provider-switch-select"
            value={`${active.providerId}::${active.model}`}
            onChange={e => {
              const [providerId, model] = e.target.value.split('::');
              setActive({ providerId, model });
            }}
          >
            {providers.map(p => (
              <optgroup key={p.id} label={p.name}>
                {p.models.map(m => <option key={m} value={`${p.id}::${m}`}>{m}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="ai-provider-hint">
            Switching starts a fresh conversation — turns can't carry between providers.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AiProviderModal() {
  const providers = useAssistantStore(s => s.providers);
  const addProvider = useAssistantStore(s => s.addProvider);
  const updateProvider = useAssistantStore(s => s.updateProvider);
  const toggleSettings = useAssistantStore(s => s.toggleSettings);

  // The form REPLACES the list rather than stacking below it. Stacked, the
  // dialog outgrew short windows and pushed Save off-screen, and two primary
  // buttons ("Save provider" and "Done") sat on one surface competing to be
  // the thing that commits the edit.
  const [editing, setEditing] = useState<Draft | null>(providers.length ? null : anthropicDraft());

  const close = () => toggleSettings(false);
  const dialogProps = useModalDismiss(close);

  const save = (d: Draft) => {
    if (d.id) updateProvider(d.id, d);
    else addProvider(d);
    setEditing(null);
  };

  const title = editing
    ? (editing.id ? `Edit ${editing.name || 'provider'}` : 'Add a provider')
    : 'Language models';

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal ai-provider-modal" {...dialogProps}>
        <div className="ai-provider-head">
          <h2>{title}</h2>
          <p className="modal-copy">
            {editing
              ? 'Point the assistant at any endpoint you have access to.'
              : 'Keys are stored only in this browser and never written into plan files.'}
          </p>
        </div>

        {editing ? (
          <ProviderForm
            key={editing.id ?? 'new'}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        ) : (
          <>
            <ProviderList onAdd={setEditing} onEdit={p => setEditing({ ...p })} />
            <div className="modal-actions">
              <button className="btn-primary" onClick={close}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
