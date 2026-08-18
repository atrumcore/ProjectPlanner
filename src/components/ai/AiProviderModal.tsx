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

const emptyDraft = (): Draft => ({ name: '', apiType: 'openai-chat', apiKey: '', baseUrl: '', models: [] });

const anthropicDraft = (): Draft => ({
  name: 'Anthropic',
  apiType: 'anthropic',
  apiKey: '',
  baseUrl: '',
  models: [...ANTHROPIC_SUGGESTED_MODELS],
});

function ProviderForm({ initial, onCancel, onSave }: {
  initial: Draft;
  onCancel: () => void;
  onSave: (d: Draft) => void;
}) {
  const providers = useAssistantStore(s => s.providers);
  const [draft, setDraft] = useState<Draft>(initial);
  const [modelText, setModelText] = useState(initial.models.join('\n'));
  const [touched, setTouched] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const models = useMemo(() => normaliseModels(modelText.split('\n')), [modelText]);
  const candidate: Draft = { ...draft, models };
  const errors = validateProvider(candidate, providers);
  const needsKey = providerNeedsKey(candidate);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  const fetchModels = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFetching(true);
    setFetchError(null);
    try {
      const baseUrl = candidate.baseUrl?.trim() || DEFAULT_BASE_URL[candidate.apiType];
      const found = candidate.apiType === 'anthropic'
        ? await listAnthropicModels(candidate.apiKey ?? '', baseUrl, ctrl.signal)
        : await listOpenAiModels(candidate.apiKey, baseUrl, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!found.length) {
        setFetchError('The endpoint returned no models. Type them in below instead.');
        return;
      }
      setModelText(found.join('\n'));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setFetchError(describeProviderFailure(err).message);
    } finally {
      if (!ctrl.signal.aborted) setFetching(false);
    }
  };

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSave({ ...candidate, name: candidate.name.trim(), baseUrl: candidate.baseUrl?.trim() || undefined });
  };

  const show = (field: keyof typeof errors) => touched && errors[field];

  return (
    <div className="ai-provider-form">
      <label htmlFor="ai-provider-name">Provider name</label>
      <input
        id="ai-provider-name"
        value={draft.name}
        autoFocus
        placeholder="e.g. Work gateway"
        onChange={e => set('name', e.target.value)}
      />
      {show('name') && <p className="ai-provider-error">{errors.name}</p>}

      <label htmlFor="ai-provider-type">API type</label>
      <select
        id="ai-provider-type"
        value={draft.apiType}
        onChange={e => set('apiType', e.target.value as ApiType)}
      >
        {API_TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <p className="ai-provider-hint">
        {API_TYPE_OPTIONS.find(o => o.id === draft.apiType)?.hint}
      </p>

      <label htmlFor="ai-provider-url">Base URL <span className="ai-provider-optional">optional</span></label>
      <input
        id="ai-provider-url"
        value={draft.baseUrl ?? ''}
        placeholder={DEFAULT_BASE_URL[draft.apiType]}
        onChange={e => set('baseUrl', e.target.value)}
      />
      {show('baseUrl') && <p className="ai-provider-error">{errors.baseUrl}</p>}

      <label htmlFor="ai-provider-key">
        API key {!needsKey && <span className="ai-provider-optional">optional for this host</span>}
      </label>
      <input
        id="ai-provider-key"
        type="password"
        autoComplete="off"
        value={draft.apiKey ?? ''}
        placeholder={needsKey ? 'Required' : 'Leave blank if your endpoint needs no key'}
        onChange={e => set('apiKey', e.target.value)}
      />
      {show('apiKey') && <p className="ai-provider-error">{errors.apiKey}</p>}

      <div className="ai-provider-models-head">
        <label htmlFor="ai-provider-models">Models <span className="ai-provider-optional">one per line</span></label>
        <button className="btn-quiet" onClick={fetchModels} disabled={fetching}>
          {fetching ? 'Fetching…' : 'Fetch models'}
        </button>
      </div>
      <textarea
        id="ai-provider-models"
        rows={5}
        spellCheck={false}
        value={modelText}
        placeholder={'gpt-5.3\nllama3.1:70b'}
        onChange={e => setModelText(e.target.value)}
      />
      {fetchError && <p className="ai-provider-error">{fetchError}</p>}
      {show('models') && <p className="ai-provider-error">{errors.models}</p>}

      <div className="ai-provider-form-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Save provider</button>
      </div>
    </div>
  );
}

export default function AiProviderModal() {
  const providers = useAssistantStore(s => s.providers);
  const active = useAssistantStore(s => s.active);
  const addProvider = useAssistantStore(s => s.addProvider);
  const updateProvider = useAssistantStore(s => s.updateProvider);
  const removeProvider = useAssistantStore(s => s.removeProvider);
  const setActive = useAssistantStore(s => s.setActive);
  const toggleSettings = useAssistantStore(s => s.toggleSettings);

  const [editing, setEditing] = useState<Draft | null>(providers.length ? null : anthropicDraft());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Armed destructive confirms auto-disarm after 3s (v2 buttons card).
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);

  const close = () => toggleSettings(false);
  const dialogProps = useModalDismiss(close);

  const save = (d: Draft) => {
    if (d.id) updateProvider(d.id, d);
    else addProvider(d);
    setEditing(null);
  };

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal ai-provider-modal" {...dialogProps}>
        <h2>Language models</h2>
        <p className="modal-copy">
          Point the assistant at any endpoint you have access to. Keys are stored
          only in this browser and never written into plan files.
        </p>

        {providers.length > 0 && (
          <ul className="ai-provider-list">
            {providers.map(p => {
              const isActive = active?.providerId === p.id;
              return (
                <li key={p.id} className={`ai-provider-row${isActive ? ' is-active' : ''}`}>
                  <div className="ai-provider-row-main">
                    <span className="ai-provider-row-name">{p.name}</span>
                    <span className="ai-provider-row-meta">
                      {API_TYPE_OPTIONS.find(o => o.id === p.apiType)?.label}
                      {' · '}
                      {p.models.length} model{p.models.length === 1 ? '' : 's'}
                      {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                      {providerNeedsKey(p) || p.apiKey ? '' : ' · no key'}
                    </span>
                  </div>
                  {isActive && <span className="ai-provider-active-chip">In use</span>}
                  <button className="btn-quiet" onClick={() => setEditing({ ...p })}>Edit</button>
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

        {editing ? (
          <ProviderForm
            key={editing.id ?? 'new'}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        ) : (
          <div className="ai-provider-add-row">
            <button className="btn-primary" onClick={() => setEditing(emptyDraft())}>
              Add custom endpoint
            </button>
            {!providers.some(p => p.apiType === 'anthropic') && (
              <button className="btn-secondary" onClick={() => setEditing(anthropicDraft())}>
                Add Anthropic
              </button>
            )}
          </div>
        )}

        {providers.length > 1 && active && !editing && (
          <div className="ai-provider-switch">
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
                  {p.models.map(m => (
                    <option key={m} value={`${p.id}::${m}`}>{m}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}
