import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGanttStore } from '../store/useGanttStore';
import type { Environment, PhaseType } from '../types/gantt';
import { ENV_COLOR_PRESETS } from '../types/gantt';
import { getPhaseDef } from '../data/phasePresets';
import { getContentions } from '../utils/contention';

const PANEL_MIN = 320;
const PANEL_MAX = 720;

export default function EnvironmentsPanel() {
  const environments = useGanttStore(s => s.environments);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const environmentFocusId = useGanttStore(s => s.environmentFocusId);
  const addEnvironment = useGanttStore(s => s.addEnvironment);
  const updateEnvironment = useGanttStore(s => s.updateEnvironment);
  const removeEnvironment = useGanttStore(s => s.removeEnvironment);
  const setEnvironmentExclusive = useGanttStore(s => s.setEnvironmentExclusive);
  const setBarEnvironment = useGanttStore(s => s.setBarEnvironment);
  const toggleEnvironmentsPanel = useGanttStore(s => s.toggleEnvironmentsPanel);
  const setEnvironmentFocus = useGanttStore(s => s.setEnvironmentFocus);
  const selectBar = useGanttStore(s => s.selectBar);

  const [activeId, setActiveId] = useState<string | null>(environments[0]?.id ?? null);
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(420);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);

  // Keep activeId valid as environments come and go.
  useEffect(() => {
    if (activeId && !environments.find(e => e.id === activeId)) {
      setActiveId(environments[0]?.id ?? null);
    } else if (!activeId && environments.length > 0) {
      setActiveId(environments[0].id);
    }
  }, [environments, activeId]);

  useEffect(() => { setConfirmDelete(false); }, [activeId]);

  // Resize
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return;
      const delta = resizing.current.startX - e.clientX;
      setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, resizing.current.startWidth + delta)));
    };
    const onUp = () => { resizing.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const contentions = useMemo(
    () => getContentions({ environments, swimlanes, phaseBars }),
    [environments, swimlanes, phaseBars]
  );

  const contentionCountByEnv = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contentions) m.set(c.envId, (m.get(c.envId) || 0) + 1);
    return m;
  }, [contentions]);

  const activeEnv: Environment | null = useMemo(
    () => environments.find(e => e.id === activeId) ?? null,
    [environments, activeId]
  );

  const barsInEnv = useMemo(
    () => activeEnv ? phaseBars.filter(b => b.environmentId === activeEnv.id) : [],
    [phaseBars, activeEnv]
  );

  const activeContentions = useMemo(
    () => activeEnv ? contentions.filter(c => c.envId === activeEnv.id) : [],
    [contentions, activeEnv]
  );

  const handleClose = useCallback(() => setClosing(true), []);

  const handleAddEnv = useCallback(() => {
    const id = addEnvironment('');
    setActiveId(id);
    setEditingName(true);
  }, [addEnvironment]);

  const handleDelete = useCallback(() => {
    if (!activeEnv) return;
    if (confirmDelete) {
      removeEnvironment(activeEnv.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  }, [activeEnv, confirmDelete, removeEnvironment]);

  const handleTabClick = useCallback((id: string) => {
    if (activeId === id) {
      // Toggle focus mode
      setEnvironmentFocus(environmentFocusId === id ? null : id);
    } else {
      setActiveId(id);
      // If focus was on a different env, switch focus to the new active env
      if (environmentFocusId !== null) setEnvironmentFocus(id);
    }
  }, [activeId, environmentFocusId, setEnvironmentFocus]);

  const swimlaneNameById = useCallback(
    (id: string) => swimlanes.find(s => s.id === id)?.projectName ?? '(deleted)',
    [swimlanes]
  );

  const phaseLabel = (t: PhaseType) => getPhaseDef(t, phaseTypes).label || t;

  const handleScrollToContention = useCallback((barAId: string) => {
    selectBar(barAId);
    window.dispatchEvent(new CustomEvent('gantt:scroll-to-bar', { detail: { barId: barAId } }));
  }, [selectBar]);

  return createPortal(
    <div
      className={`env-panel${closing ? ' env-panel--closing' : ''}`}
      style={{ width }}
      onAnimationEnd={() => { if (closing) toggleEnvironmentsPanel(); }}
    >
      <div
        className="env-panel-resize-handle"
        onPointerDown={e => {
          e.preventDefault();
          (e.target as Element).setPointerCapture(e.pointerId);
          resizing.current = { startX: e.clientX, startWidth: width };
        }}
      />

      <div className="env-panel-header">
        <span>Environments</span>
        <div className="env-panel-header-actions">
          <button onClick={handleClose} title="Close (Ctrl+Shift+E)" aria-label="Close">&times;</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="env-panel-tabs">
        {environments.map(e => {
          const conflictCount = contentionCountByEnv.get(e.id) || 0;
          const isFocused = environmentFocusId === e.id;
          return (
            <button
              key={e.id}
              className={`env-panel-tab${activeId === e.id ? ' active' : ''}${isFocused ? ' focused' : ''}`}
              onClick={() => handleTabClick(e.id)}
              title={isFocused ? 'Active focus — click to clear' : activeId === e.id ? 'Click to enter focus mode' : 'Switch to this environment'}
              style={{ borderBottomColor: activeId === e.id ? e.color : 'transparent' }}
            >
              <span className="env-panel-tab-dot" style={{ background: e.color }} />
              {e.name}
              {conflictCount > 0 && (
                <span className="env-panel-tab-badge">{conflictCount}</span>
              )}
            </button>
          );
        })}
        <button className="env-panel-tab-add" onClick={handleAddEnv} title="New environment">+ New</button>
      </div>

      {/* Body */}
      {!activeEnv ? (
        <div className="env-panel-empty">
          <p>No environments yet.</p>
          <p>Create one for each shared infrastructure (Dev, QA, PREPROD, …) and then map phase types to them.</p>
          <button onClick={handleAddEnv} className="env-panel-primary-btn">Create environment</button>
        </div>
      ) : (
        <div className="env-panel-body">
          {/* Identity row */}
          <div className="env-panel-identity">
            <label>Name</label>
            {editingName ? (
              <input
                autoFocus
                defaultValue={activeEnv.name}
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v) updateEnvironment(activeEnv.id, { name: v });
                  setEditingName(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingName(false);
                }}
              />
            ) : (
              <span className="env-panel-name" onClick={() => setEditingName(true)} title="Click to rename">
                {activeEnv.name}
              </span>
            )}
            <div className="env-panel-color-wrap">
              <button
                className="env-panel-color-btn"
                style={{ background: activeEnv.color }}
                onClick={() => setShowColorPicker(v => !v)}
                title="Change color"
              />
              {showColorPicker && (
                <div className="env-panel-color-picker">
                  {ENV_COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      className="env-panel-color-swatch"
                      style={{ background: c }}
                      onClick={() => {
                        updateEnvironment(activeEnv.id, { color: c });
                        setShowColorPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="env-panel-status">
            {activeContentions.length} contention{activeContentions.length === 1 ? '' : 's'}
            <span className="env-panel-status-sep">·</span>
            {barsInEnv.length} bar{barsInEnv.length === 1 ? '' : 's'} in this env
          </div>

          {/* Behaviour toggle */}
          <div className="env-panel-section">
            <div className="env-panel-section-header">
              <h4>Behaviour</h4>
            </div>
            <div className="env-panel-behaviour">
              <div className="env-panel-toggle">
                <button
                  className={activeEnv.exclusive ? 'active' : undefined}
                  onClick={() => setEnvironmentExclusive(activeEnv.id, true)}
                >
                  Exclusive
                </button>
                <button
                  className={!activeEnv.exclusive ? 'active' : undefined}
                  onClick={() => setEnvironmentExclusive(activeEnv.id, false)}
                >
                  Shared
                </button>
              </div>
              <p className="env-panel-behaviour-desc">
                {activeEnv.exclusive
                  ? 'Only one project can use this environment at a time. Overlapping bars on different projects whose phase type maps here are flagged as contention.'
                  : 'Multiple projects can use this environment in parallel. No contention is reported.'}
              </p>
            </div>
          </div>

          {/* Bars currently in this env */}
          <div className="env-panel-section">
            <div className="env-panel-section-header">
              <h4>Bars in this environment ({barsInEnv.length})</h4>
            </div>
            {barsInEnv.length === 0 ? (
              <div className="env-panel-section-empty">
                No bars assigned. Right-click a bar on the timeline to set its environment.
              </div>
            ) : (
              <ul className="env-panel-list">
                {barsInEnv.map(bar => {
                  const def = phaseTypes.find(t => t.id === bar.phaseType);
                  return (
                    <li key={bar.id}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span
                          className="env-panel-phase-swatch"
                          style={{ background: def?.fill ?? '#ccc', borderColor: def?.stroke ?? '#888' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong>{swimlaneNameById(bar.swimlaneId)}</strong>
                          <span className="env-panel-contention-mid"> {bar.label || def?.label || bar.phaseType} </span>
                        </span>
                        <span className="env-panel-contention-week">
                          wk {bar.startWeek.toFixed(1)}–{(bar.startWeek + bar.durationWeeks).toFixed(1)}
                        </span>
                      </span>
                      <button
                        onClick={() => setBarEnvironment(bar.id, null)}
                        title="Unassign this bar from the environment"
                        aria-label="Unassign"
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Contentions */}
          <div className="env-panel-section">
            <div className="env-panel-section-header">
              <h4>Contentions ({activeContentions.length})</h4>
            </div>
            {activeContentions.length === 0 ? (
              <div className="env-panel-section-empty">No contentions in this environment.</div>
            ) : (
              <ul className="env-panel-contention-list">
                {activeContentions.map((c, i) => (
                  <li
                    key={i}
                    onClick={() => handleScrollToContention(c.barAId)}
                    title="Click to select first bar"
                  >
                    <strong>{swimlaneNameById(c.swimlaneAId)}</strong>
                    <span className="env-panel-contention-mid"> {phaseLabel(c.phaseTypeA)} </span>
                    vs
                    <strong> {swimlaneNameById(c.swimlaneBId)}</strong>
                    <span className="env-panel-contention-mid"> {phaseLabel(c.phaseTypeB)} </span>
                    <span className="env-panel-contention-week">
                      wk {c.weekRange[0].toFixed(1)}–{c.weekRange[1].toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="env-panel-footer">
            <button
              className={`env-panel-delete${confirmDelete ? ' confirm' : ''}`}
              onClick={handleDelete}
            >
              {confirmDelete
                ? `Click to confirm${barsInEnv.length > 0 ? ` — ${barsInEnv.length} bar${barsInEnv.length === 1 ? '' : 's'} will be unassigned` : ''}`
                : 'Delete environment'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
