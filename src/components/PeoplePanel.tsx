import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGanttStore } from '../store/useGanttStore';
import type { PhaseType } from '../types/gantt';
import { PEOPLE_COLOR_PRESETS } from '../types/gantt';
import { getPhaseDef } from '../data/phasePresets';
import { getPeopleContentions, type ResourceRef } from '../utils/contention';
import { htmlToPlainText } from '../utils/plainText';

const PANEL_MIN = 320;
const PANEL_MAX = 720;

const sameRef = (a: ResourceRef | null, b: ResourceRef | null) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;

/**
 * People & Teams panel — the people analogue of EnvironmentsPanel (and it
 * reuses its CSS classes). One tab per team and per person; the active tab
 * shows identity, allocated bars, and double-booking contentions. Clicking
 * the active tab toggles focus mode, dimming bars not allocated to it.
 */
export default function PeoplePanel() {
  const teams = useGanttStore(s => s.teams);
  const people = useGanttStore(s => s.people);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const peopleFocus = useGanttStore(s => s.peopleFocus);
  const addTeam = useGanttStore(s => s.addTeam);
  const updateTeam = useGanttStore(s => s.updateTeam);
  const removeTeam = useGanttStore(s => s.removeTeam);
  const addPerson = useGanttStore(s => s.addPerson);
  const updatePerson = useGanttStore(s => s.updatePerson);
  const removePerson = useGanttStore(s => s.removePerson);
  const setBarPeople = useGanttStore(s => s.setBarPeople);
  const togglePeoplePanel = useGanttStore(s => s.togglePeoplePanel);
  const setPeopleFocus = useGanttStore(s => s.setPeopleFocus);
  const selectBar = useGanttStore(s => s.selectBar);

  const orderedTeams = useMemo(() => [...teams].sort((a, b) => a.order - b.order), [teams]);
  const orderedPeople = useMemo(() => [...people].sort((a, b) => a.order - b.order), [people]);

  const firstRef = useMemo<ResourceRef | null>(() => {
    if (orderedTeams.length > 0) return { kind: 'team', id: orderedTeams[0].id };
    if (orderedPeople.length > 0) return { kind: 'person', id: orderedPeople[0].id };
    return null;
  }, [orderedTeams, orderedPeople]);

  const [active, setActive] = useState<ResourceRef | null>(firstRef);
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(420);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);

  // Keep the active selection valid as resources come and go.
  useEffect(() => {
    const exists = active && (active.kind === 'team'
      ? teams.some(t => t.id === active.id)
      : people.some(p => p.id === active.id));
    if (!exists) setActive(firstRef);
  }, [teams, people, active, firstRef]);

  useEffect(() => { setConfirmDelete(false); setEditingName(false); setEditingRole(false); setShowColorPicker(false); }, [active]);

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
    () => getPeopleContentions({ people, teams, phaseBars }),
    [people, teams, phaseBars]
  );

  const contentionCountByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contentions) {
      const key = `${c.resource.kind}:${c.resource.id}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [contentions]);

  const activeTeam = active?.kind === 'team' ? teams.find(t => t.id === active.id) ?? null : null;
  const activePerson = active?.kind === 'person' ? people.find(p => p.id === active.id) ?? null : null;

  const barsForActive = useMemo(() => {
    if (!active) return [];
    return phaseBars.filter(b => active.kind === 'team'
      ? b.teamIds.includes(active.id)
      : b.assigneeIds.includes(active.id));
  }, [phaseBars, active]);

  const activeContentions = useMemo(
    () => active ? contentions.filter(c => sameRef(c.resource, active)) : [],
    [contentions, active]
  );

  const teamMembers = useMemo(
    () => activeTeam ? orderedPeople.filter(p => p.teamId === activeTeam.id) : [],
    [orderedPeople, activeTeam]
  );

  const handleClose = useCallback(() => setClosing(true), []);

  const handleAddTeam = useCallback(() => {
    const id = addTeam('');
    setActive({ kind: 'team', id });
    setEditingName(true);
  }, [addTeam]);

  const handleAddPerson = useCallback(() => {
    const id = addPerson('');
    setActive({ kind: 'person', id });
    setEditingName(true);
  }, [addPerson]);

  const handleDelete = useCallback(() => {
    if (!active) return;
    if (confirmDelete) {
      if (active.kind === 'team') removeTeam(active.id);
      else removePerson(active.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  }, [active, confirmDelete, removeTeam, removePerson]);

  const handleTabClick = useCallback((ref: ResourceRef) => {
    if (sameRef(active, ref)) {
      // Toggle focus mode
      setPeopleFocus(sameRef(peopleFocus, ref) ? null : ref);
    } else {
      setActive(ref);
      if (peopleFocus !== null) setPeopleFocus(ref);
    }
  }, [active, peopleFocus, setPeopleFocus]);

  const swimlaneNameById = useCallback(
    (id: string) => {
      const lane = swimlanes.find(s => s.id === id);
      return lane ? htmlToPlainText(lane.projectName) : '(deleted)';
    },
    [swimlanes]
  );

  const phaseLabel = (t: PhaseType) => getPhaseDef(t, phaseTypes).label || t;

  const handleScrollToContention = useCallback((barAId: string) => {
    selectBar(barAId);
    window.dispatchEvent(new CustomEvent('gantt:scroll-to-bar', { detail: { barId: barAId } }));
  }, [selectBar]);

  const handleUnassignBar = useCallback((barId: string) => {
    if (!active) return;
    const bar = phaseBars.find(b => b.id === barId);
    if (!bar) return;
    if (active.kind === 'team') {
      setBarPeople(barId, { teamIds: bar.teamIds.filter(id => id !== active.id) });
    } else {
      setBarPeople(barId, { assigneeIds: bar.assigneeIds.filter(id => id !== active.id) });
    }
  }, [active, phaseBars, setBarPeople]);

  const activeName = activeTeam?.name ?? activePerson?.name ?? '';
  const activeColor = activeTeam?.color ?? activePerson?.color ?? '#888';

  const renderTab = (ref: ResourceRef, name: string, color: string, isTeam: boolean) => {
    const key = `${ref.kind}:${ref.id}`;
    const conflictCount = contentionCountByKey.get(key) || 0;
    const isActive = sameRef(active, ref);
    const isFocused = sameRef(peopleFocus, ref);
    return (
      <button
        key={key}
        className={`env-panel-tab${isActive ? ' active' : ''}${isFocused ? ' focused' : ''}`}
        onClick={() => handleTabClick(ref)}
        title={isFocused ? 'Active focus — click to clear' : isActive ? 'Click to enter focus mode' : `Switch to this ${ref.kind}`}
        style={{ borderBottomColor: isActive ? color : 'transparent' }}
      >
        <span
          className={`env-panel-tab-dot${isTeam ? ' people-panel-team-dot' : ''}`}
          style={{ background: color }}
        />
        {name}
        {conflictCount > 0 && (
          <span className="env-panel-tab-badge">{conflictCount}</span>
        )}
      </button>
    );
  };

  return createPortal(
    <div
      className={`env-panel${closing ? ' env-panel--closing' : ''}`}
      style={{ width }}
      onAnimationEnd={() => { if (closing) togglePeoplePanel(); }}
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
        <span>People &amp; Teams</span>
        <div className="env-panel-header-actions">
          <button onClick={handleClose} title="Close (Ctrl+Shift+P)" aria-label="Close">&times;</button>
        </div>
      </div>

      {/* Tabs — teams first, then people */}
      <div className="env-panel-tabs">
        {orderedTeams.map(t => renderTab({ kind: 'team', id: t.id }, t.name, t.color, true))}
        {orderedPeople.map(p => renderTab({ kind: 'person', id: p.id }, p.name, p.color, false))}
        <button className="env-panel-tab-add" onClick={handleAddTeam} title="New team">+ Team</button>
        <button className="env-panel-tab-add" onClick={handleAddPerson} title="New person">+ Person</button>
      </div>

      {/* Body */}
      {!active || (!activeTeam && !activePerson) ? (
        <div className="env-panel-empty">
          <p>No people or teams yet.</p>
          <p>Add the teams and people who execute the planned work, then allocate them to phase bars. Double-bookings across projects are flagged automatically.</p>
          <button onClick={handleAddTeam} className="env-panel-primary-btn">Create team</button>
          <button onClick={handleAddPerson} className="env-panel-primary-btn">Add person</button>
        </div>
      ) : (
        <div className="env-panel-body">
          {/* Identity row */}
          <div className="env-panel-identity">
            <label>{activeTeam ? 'Team' : 'Name'}</label>
            {editingName ? (
              <input
                autoFocus
                defaultValue={activeName}
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v) {
                    if (activeTeam) updateTeam(activeTeam.id, { name: v });
                    else if (activePerson) updatePerson(activePerson.id, { name: v });
                  }
                  setEditingName(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingName(false);
                }}
              />
            ) : (
              <span className="env-panel-name" onClick={() => setEditingName(true)} title="Click to rename">
                {activeName}
              </span>
            )}
            <div className="env-panel-color-wrap">
              <button
                className="env-panel-color-btn"
                style={{ background: activeColor }}
                onClick={() => setShowColorPicker(v => !v)}
                title="Change color"
              />
              {showColorPicker && (
                <div className="env-panel-color-picker">
                  {PEOPLE_COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      className="env-panel-color-swatch"
                      style={{ background: c }}
                      onClick={() => {
                        if (activeTeam) updateTeam(activeTeam.id, { color: c });
                        else if (activePerson) updatePerson(activePerson.id, { color: c });
                        setShowColorPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Person extras: role + team membership */}
          {activePerson && (
            <div className="people-panel-person-meta">
              <label>Role</label>
              {editingRole ? (
                <input
                  autoFocus
                  defaultValue={activePerson.role ?? ''}
                  placeholder="e.g. Backend Dev"
                  onBlur={e => {
                    updatePerson(activePerson.id, { role: e.target.value.trim() || undefined });
                    setEditingRole(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingRole(false);
                  }}
                />
              ) : (
                <span
                  className="env-panel-name people-panel-role"
                  onClick={() => setEditingRole(true)}
                  title="Click to edit role"
                >
                  {activePerson.role || <em>none</em>}
                </span>
              )}
              <label>Team</label>
              <select
                value={activePerson.teamId ?? ''}
                onChange={e => updatePerson(activePerson.id, { teamId: e.target.value || null })}
              >
                <option value="">No team</option>
                {orderedTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Team extras: members */}
          {activeTeam && (
            <div className="env-panel-section">
              <div className="env-panel-section-header">
                <h4>Members ({teamMembers.length})</h4>
              </div>
              {teamMembers.length === 0 ? (
                <div className="env-panel-section-empty">
                  No members. Open a person and set their Team to add them.
                </div>
              ) : (
                <div className="people-panel-members">
                  {teamMembers.map(p => (
                    <button
                      key={p.id}
                      className="people-panel-member-chip"
                      onClick={() => setActive({ kind: 'person', id: p.id })}
                      title="Open person"
                    >
                      <span className="env-panel-tab-dot" style={{ background: p.color }} />
                      {p.name}{p.role ? ` · ${p.role}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="env-panel-status">
            {activeContentions.length} contention{activeContentions.length === 1 ? '' : 's'}
            <span className="env-panel-status-sep">·</span>
            {barsForActive.length} bar{barsForActive.length === 1 ? '' : 's'} allocated
          </div>

          {/* Bars allocated to this resource */}
          <div className="env-panel-section">
            <div className="env-panel-section-header">
              <h4>Allocated bars ({barsForActive.length})</h4>
            </div>
            {barsForActive.length === 0 ? (
              <div className="env-panel-section-empty">
                Nothing allocated. Click the people chip on a timeline bar to assign {activeTeam ? 'this team' : 'this person'}.
              </div>
            ) : (
              <ul className="env-panel-list">
                {barsForActive.map(bar => {
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
                        onClick={() => handleUnassignBar(bar.id)}
                        title={`Remove ${activeName} from this bar`}
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
              <div className="env-panel-section-empty">
                No double-bookings for {activeName}.
              </div>
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
                ? `Click to confirm${barsForActive.length > 0 ? ` — removed from ${barsForActive.length} bar${barsForActive.length === 1 ? '' : 's'}` : ''}`
                : `Delete ${active.kind}`}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
