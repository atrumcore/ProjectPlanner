import { useState, useMemo, useCallback } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { Person, PhaseType, Team } from '../types/gantt';
import { PEOPLE_COLOR_PRESETS } from '../types/gantt';
import { getPhaseDef } from '../data/phasePresets';
import { getPeopleContentions, type ResourceRef } from '../utils/contention';
import { htmlToPlainText } from '../utils/plainText';

const sameRef = (a: ResourceRef | null, b: ResourceRef | null) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;

const refKey = (r: ResourceRef) => `${r.kind}:${r.id}`;

/**
 * People & Teams tab content — a searchable master-detail layout built to
 * scale to large rosters. Top: a team-grouped roster list with search and a
 * conflicts-only filter. Bottom: a fixed detail pane for the selected person
 * or team (identity editing, focus mode, allocated bars, double-bookings).
 * Hosted inside the shared RailPanel shell (width/resize/header live there).
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
  const setPeopleFocus = useGanttStore(s => s.setPeopleFocus);
  const selectBar = useGanttStore(s => s.selectBar);

  const [active, setActive] = useState<ResourceRef | null>(null);
  const [search, setSearch] = useState('');
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const orderedTeams = useMemo(() => [...teams].sort((a, b) => a.order - b.order), [teams]);
  const orderedPeople = useMemo(() => [...people].sort((a, b) => a.order - b.order), [people]);

  // Select a resource, resetting any in-flight edit state from the previous
  // selection. A selection whose entity was deleted needs no cleanup effect —
  // the derived activeTeam/activePerson lookups below simply come back null
  // and the detail pane falls back to its empty state.
  const selectResource = useCallback((ref: ResourceRef | null) => {
    setActive(ref);
    setConfirmDelete(false);
    setEditingName(false);
    setEditingRole(false);
    setShowColorPicker(false);
  }, []);

  const contentions = useMemo(
    () => getPeopleContentions({ people, teams, phaseBars }),
    [people, teams, phaseBars]
  );

  const contentionCountByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contentions) {
      const key = refKey(c.resource);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [contentions]);

  const conflictCount = useCallback(
    (ref: ResourceRef) => contentionCountByKey.get(refKey(ref)) || 0,
    [contentionCountByKey]
  );

  // ── Roster (search + filter + grouping) ──────────────────────────────────
  const query = search.trim().toLowerCase();
  const filtering = query.length > 0 || conflictsOnly;

  const matchesPerson = useCallback((p: Person, teamName: string | undefined) => {
    if (conflictsOnly && conflictCount({ kind: 'person', id: p.id }) === 0) return false;
    if (!query) return true;
    return p.name.toLowerCase().includes(query)
      || (p.role ?? '').toLowerCase().includes(query)
      || (teamName ?? '').toLowerCase().includes(query);
  }, [query, conflictsOnly, conflictCount]);

  const matchesTeam = useCallback((t: Team) => {
    if (conflictsOnly && conflictCount({ kind: 'team', id: t.id }) === 0) return false;
    if (!query) return true;
    return t.name.toLowerCase().includes(query);
  }, [query, conflictsOnly, conflictCount]);

  /** Groups: one per team (header + visible members), then unteamed people.
   * While searching/filtering, a group shows if its header OR any member
   * matches; collapse state is ignored so results are never hidden. */
  const rosterGroups = useMemo(() => {
    const groups: Array<{ team: Team | null; members: Person[]; teamVisible: boolean }> = [];
    for (const team of orderedTeams) {
      const members = orderedPeople.filter(p => p.teamId === team.id);
      const visibleMembers = members.filter(p => matchesPerson(p, team.name));
      const teamVisible = matchesTeam(team);
      if (!filtering || teamVisible || visibleMembers.length > 0) {
        groups.push({
          team,
          members: filtering ? (teamVisible ? members.filter(p => !conflictsOnly || matchesPerson(p, team.name)) : visibleMembers) : members,
          teamVisible: true,
        });
      }
    }
    const unteamed = orderedPeople.filter(p => !p.teamId || !teams.some(t => t.id === p.teamId));
    const visibleUnteamed = filtering ? unteamed.filter(p => matchesPerson(p, undefined)) : unteamed;
    if (visibleUnteamed.length > 0) {
      groups.push({ team: null, members: visibleUnteamed, teamVisible: true });
    }
    return groups;
  }, [orderedTeams, orderedPeople, teams, filtering, conflictsOnly, matchesPerson, matchesTeam]);

  const toggleCollapse = useCallback((teamId: string) => {
    setCollapsedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  // ── Selection detail data ────────────────────────────────────────────────
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

  const isFocused = sameRef(peopleFocus, active);

  const handleAddTeam = useCallback(() => {
    const id = addTeam('');
    selectResource({ kind: 'team', id });
    setEditingName(true);
  }, [addTeam, selectResource]);

  const handleAddPerson = useCallback(() => {
    const id = addPerson('');
    selectResource({ kind: 'person', id });
    setEditingName(true);
  }, [addPerson, selectResource]);

  const handleDelete = useCallback(() => {
    if (!active) return;
    if (confirmDelete) {
      if (active.kind === 'team') removeTeam(active.id);
      else removePerson(active.id);
      selectResource(null);
    } else {
      setConfirmDelete(true);
    }
  }, [active, confirmDelete, removeTeam, removePerson, selectResource]);

  const handleToggleFocus = useCallback(() => {
    if (!active) return;
    setPeopleFocus(isFocused ? null : active);
  }, [active, isFocused, setPeopleFocus]);

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

  const rosterEmpty = teams.length === 0 && people.length === 0;

  return (
    <>
      {/* Search / filter / add row — hidden while the roster is empty so the
          teach state's single primary action is the only affordance. */}
      {!rosterEmpty && (
        <div className="people-roster-toolbar">
          <input
            className="people-roster-search"
            type="search"
            placeholder="Search people, roles, teams…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={`people-roster-filter${conflictsOnly ? ' active' : ''}`}
            onClick={() => setConflictsOnly(v => !v)}
            title="Show only people/teams with double-bookings"
          >
            &#x26A0; {contentions.length > 0 ? contentions.length : ''}
          </button>
          <button className="people-roster-add" onClick={handleAddPerson} title="Add person">+ Person</button>
          <button className="people-roster-add" onClick={handleAddTeam} title="Add team">+ Team</button>
        </div>
      )}

      {/* Roster list */}
      {rosterEmpty ? (
        <div className="teach-state">
          <div className="kicker">People &amp; teams</div>
          <p>Assign people to phase bars and double-bookings across projects get flagged automatically.</p>
          <button onClick={handleAddPerson} className="btn-primary">Add person</button>
          <button onClick={handleAddTeam} className="btn-quiet">or create a team</button>
        </div>
      ) : (
        <div className="people-roster">
          {rosterGroups.length === 0 && (
            <div className="people-roster-no-results">
              No matches{conflictsOnly ? ' — no double-bookings' : ''}.
            </div>
          )}
          {rosterGroups.map(group => {
            const team = group.team;
            const collapsed = !filtering && team !== null && collapsedTeams.has(team.id);
            const teamRef: ResourceRef | null = team ? { kind: 'team', id: team.id } : null;
            const teamConflicts = teamRef ? conflictCount(teamRef) : 0;
            // Conflicts hidden inside a collapsed group still deserve a signal.
            const memberConflicts = group.members.reduce(
              (sum, p) => sum + conflictCount({ kind: 'person', id: p.id }), 0);
            return (
              <div key={team?.id ?? '__none__'} className="people-roster-group">
                {team ? (
                  <div
                    className={`people-roster-team${sameRef(active, teamRef) ? ' selected' : ''}`}
                    onClick={() => selectResource(teamRef)}
                  >
                    <button
                      className="people-roster-chevron"
                      onClick={e => { e.stopPropagation(); toggleCollapse(team.id); }}
                      title={collapsed ? 'Expand' : 'Collapse'}
                      disabled={filtering}
                    >
                      {collapsed ? '▸' : '▾'}
                    </button>
                    <span className="people-roster-dot is-team" style={{ background: team.color }} />
                    <span className="people-roster-name">{team.name}</span>
                    <span className="people-roster-meta">{group.members.length || 'no'} member{group.members.length === 1 ? '' : 's'}</span>
                    {teamConflicts > 0 && <span className="env-panel-tab-badge">{teamConflicts}</span>}
                    {collapsed && memberConflicts > 0 && (
                      <span className="env-panel-tab-badge is-muted" title="Double-bookings inside this team">{memberConflicts}</span>
                    )}
                  </div>
                ) : (
                  <div className="people-roster-team is-label">
                    <span className="people-roster-name people-roster-unteamed">No team</span>
                  </div>
                )}
                {!collapsed && group.members.map(p => {
                  const ref: ResourceRef = { kind: 'person', id: p.id };
                  const conflicts = conflictCount(ref);
                  return (
                    <div
                      key={p.id}
                      className={`people-roster-person${sameRef(active, ref) ? ' selected' : ''}`}
                      onClick={() => selectResource(ref)}
                    >
                      <span className="people-roster-dot" style={{ background: p.color }} />
                      <span className="people-roster-name">{p.name}</span>
                      {p.role && <span className="people-roster-meta">{p.role}</span>}
                      {conflicts > 0 && <span className="env-panel-tab-badge">{conflicts}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail pane (fixed below the roster) */}
      {!rosterEmpty && (
        !active || (!activeTeam && !activePerson) ? (
          <div className="people-detail people-detail-empty">
            Select a person or team to see details, allocations and double-bookings.
          </div>
        ) : (
          <div className="people-detail">
            {/* Identity row */}
            <div className="people-detail-identity">
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
              {editingName ? (
                <input
                  className="people-detail-name-input"
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
                <span className="people-detail-name" onClick={() => setEditingName(true)} title="Click to rename">
                  {activeName}
                </span>
              )}
              <span className="people-detail-kind">{active.kind}</span>
              <button
                className={`people-detail-focus${isFocused ? ' active' : ''}`}
                onClick={handleToggleFocus}
                title={isFocused ? 'Clear focus (Esc)' : 'Dim bars not allocated to this'}
              >
                {isFocused ? 'Focused' : 'Focus'}
              </button>
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
              <div className="people-detail-section">
                <h4>Members ({teamMembers.length})</h4>
                {teamMembers.length === 0 ? (
                  <div className="env-panel-section-empty">
                    No members. Select a person and set their Team to add them.
                  </div>
                ) : (
                  <div className="people-panel-members">
                    {teamMembers.map(p => (
                      <button
                        key={p.id}
                        className="people-panel-member-chip"
                        onClick={() => selectResource({ kind: 'person', id: p.id })}
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

            {/* Allocated bars */}
            <div className="people-detail-section">
              <h4>Allocated bars ({barsForActive.length})</h4>
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
            <div className="people-detail-section">
              <h4>Double-bookings ({activeContentions.length})</h4>
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

            {/* Delete */}
            <div className="people-detail-footer">
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
        )
      )}
    </>
  );
}
