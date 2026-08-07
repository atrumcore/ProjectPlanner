import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGanttStore } from '../../store/useGanttStore';
import { useAuthStore } from '../../auth/useAuthStore';
import { graph, type GraphPlanFile, type GraphTeam } from '../../graph';
import type { PlanContainer, PlanRef } from '../../types/planSource';
import { getRecentPlans, forgetPlan } from '../../utils/mru';
import { formatSavedAt } from '../../utils/dateUtils';

/** What the middle pane is showing. */
type Selection = { kind: 'team'; team: GraphTeam } | { kind: 'drafts' };

const DRAFTS_CONTAINER: PlanContainer = { type: 'drafts' };

/**
 * Home screen for signed-in users: pick a Team (or your drafts) and open a
 * plan. Teams come from Graph; a Team's plans live in one "Roadmaps" folder
 * that is created lazily the first time somebody saves a plan there.
 */
export default function LauncherScreen() {
  const account = useAuthStore(s => s.account);
  const openGraphPlan = useGanttStore(s => s.openGraphPlan);
  const createGraphPlan = useGanttStore(s => s.createGraphPlan);
  const openFile = useGanttStore(s => s.openFile);
  const newFile = useGanttStore(s => s.newFile);
  const setAppView = useGanttStore(s => s.setAppView);

  const [teams, setTeams] = useState<GraphTeam[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [teamFilter, setTeamFilter] = useState('');

  const [plans, setPlans] = useState<GraphPlanFile[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recents, setRecents] = useState<PlanRef[]>(() => getRecentPlans());

  // Load the Teams list once.
  useEffect(() => {
    let cancelled = false;
    graph.listJoinedTeams()
      .then(list => { if (!cancelled) setTeams(list); })
      .catch(e => { if (!cancelled) setTeamsError(e instanceof Error ? e.message : 'Could not load your Teams'); });
    return () => { cancelled = true; };
  }, []);

  // Selecting a container clears the previous pane's state up front, so the
  // loader effect below only has to deal with fetching.
  const selectContainer = useCallback((next: Selection) => {
    setSelection(next);
    setPlans(null);
    setPlansError(null);
    setConfirmDeleteId(null);
  }, []);

  // Load plans whenever the selection changes.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;

    const load = async () => {
      const folder = selection.kind === 'drafts'
        ? await graph.getDraftsFolder()
        // null means the Team has no Roadmaps folder yet — that's not an error,
        // it just hasn't had a plan saved into it.
        : await graph.findRoadmapsFolder(selection.team.id);
      if (!folder) return [];
      return graph.listPlanFiles(folder);
    };

    load()
      .then(list => { if (!cancelled) setPlans(list); })
      .catch(e => { if (!cancelled) setPlansError(e instanceof Error ? e.message : 'Could not load plans'); });
    return () => { cancelled = true; };
  }, [selection]);

  const container: PlanContainer | null = useMemo(() => {
    if (!selection) return null;
    return selection.kind === 'drafts'
      ? DRAFTS_CONTAINER
      : { type: 'team', teamId: selection.team.id, teamName: selection.team.displayName };
  }, [selection]);

  const visibleTeams = useMemo(() => {
    if (!teams) return null;
    const q = teamFilter.trim().toLowerCase();
    return q ? teams.filter(t => t.displayName.toLowerCase().includes(q)) : teams;
  }, [teams, teamFilter]);

  const handleOpen = useCallback(async (file: GraphPlanFile, planContainer: PlanContainer) => {
    setBusy(true);
    await openGraphPlan({ ...file, container: planContainer });
    setBusy(false);
  }, [openGraphPlan]);

  const handleOpenRecent = useCallback(async (ref: PlanRef) => {
    setBusy(true);
    const ok = await openGraphPlan({
      driveId: ref.driveId, itemId: ref.itemId, name: ref.name,
      eTag: '', lastModifiedIso: '', lastModifiedBy: null,
      container: ref.container,
    });
    // A plan that has since been deleted shouldn't linger in the list.
    if (!ok) { forgetPlan(ref.itemId); setRecents(getRecentPlans()); }
    setBusy(false);
  }, [openGraphPlan]);

  const handleNewPlan = useCallback(async () => {
    if (!container) return;
    const suggested = selection?.kind === 'team' ? `${selection.team.displayName} roadmap` : 'Untitled plan';
    const name = window.prompt('Name for the new plan', suggested);
    if (!name?.trim()) return;
    setBusy(true);
    await createGraphPlan(container, name.trim());
    setBusy(false);
  }, [container, createGraphPlan, selection]);

  const handleDelete = useCallback(async (file: GraphPlanFile) => {
    if (confirmDeleteId !== file.itemId) { setConfirmDeleteId(file.itemId); return; }
    setBusy(true);
    try {
      await graph.deletePlan(file.driveId, file.itemId);
      forgetPlan(file.itemId);
      setRecents(getRecentPlans());
      setPlans(prev => prev?.filter(p => p.itemId !== file.itemId) ?? null);
    } catch (e) {
      alert(`Could not delete: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setConfirmDeleteId(null);
    setBusy(false);
  }, [confirmDeleteId]);

  return (
    <div className="launcher">
      <div className="launcher-header">
        <span className="launcher-brand-mark" aria-hidden="true" />
        <h1>BBD Project Planner</h1>
        <div className="launcher-header-spacer" />
        {account && <span className="launcher-account">{account.name}</span>}
      </div>

      <div className="launcher-body">
        {/* Sidebar: teams + personal areas */}
        <aside className="launcher-sidebar">
          <div className="launcher-sidebar-label">Your teams</div>
          {teamsError && <div className="launcher-error">{teamsError}</div>}
          {!teams && !teamsError && <div className="launcher-muted">Loading…</div>}
          {teams && teams.length > 4 && (
            <input
              className="launcher-team-filter"
              type="search"
              placeholder="Search teams…"
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
            />
          )}
          {visibleTeams?.map(team => (
            <button
              key={team.id}
              className={`launcher-nav-item${selection?.kind === 'team' && selection.team.id === team.id ? ' active' : ''}`}
              onClick={() => selectContainer({ kind: 'team', team })}
            >
              {team.displayName}
            </button>
          ))}
          {visibleTeams?.length === 0 && <div className="launcher-muted">No matching teams.</div>}

          <div className="launcher-sidebar-divider" />
          <button
            className={`launcher-nav-item${selection?.kind === 'drafts' ? ' active' : ''}`}
            onClick={() => selectContainer({ kind: 'drafts' })}
          >
            My drafts
          </button>
          <button className="launcher-nav-item" onClick={() => { void openFile(); }}>
            Open local file…
          </button>
          <button
            className="launcher-nav-item"
            onClick={() => { newFile(); setAppView('plan'); }}
          >
            New unsaved plan
          </button>
        </aside>

        {/* Main pane */}
        <section className="launcher-main">
          {!selection ? (
            <div className="launcher-welcome">
              <h2>Pick a team to see its plans</h2>
              <p>
                Each team keeps its roadmaps in a <strong>Roadmaps</strong> folder in its
                Teams files, so anyone in the team can open them. Personal work-in-progress
                can live in <strong>My drafts</strong> until you're ready to share it.
              </p>
              {recents.length > 0 && (
                <div className="launcher-recents">
                  <div className="launcher-sidebar-label">Recent</div>
                  {recents.map(ref => (
                    <button
                      key={ref.itemId}
                      className="launcher-recent-chip"
                      disabled={busy}
                      onClick={() => { void handleOpenRecent(ref); }}
                    >
                      {ref.name.replace(/\.json$/i, '')}
                      <span className="launcher-recent-where">
                        {ref.container.type === 'team' ? ref.container.teamName : 'Drafts'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="launcher-main-header">
                <div>
                  <h2>{selection.kind === 'drafts' ? 'My drafts' : selection.team.displayName}</h2>
                  <div className="launcher-muted">
                    {selection.kind === 'drafts'
                      ? 'Private to you, stored in your OneDrive'
                      : 'Roadmaps folder · visible to everyone in this team'}
                  </div>
                </div>
                <button className="btn-primary" disabled={busy} onClick={() => { void handleNewPlan(); }}>
                  New plan
                </button>
              </div>

              {plansError && <div className="launcher-error">{plansError}</div>}
              {!plans && !plansError && <div className="launcher-muted">Loading plans…</div>}
              {plans?.length === 0 && (
                <div className="launcher-empty">
                  No plans here yet. <strong>New plan</strong> creates the first one.
                </div>
              )}

              <ul className="launcher-plan-list">
                {plans?.map(file => (
                  <li key={file.itemId}>
                    <button
                      className="launcher-plan-open"
                      disabled={busy}
                      onClick={() => { if (container) void handleOpen(file, container); }}
                    >
                      <span className="launcher-plan-name">{file.name.replace(/\.json$/i, '')}</span>
                      <span className="launcher-muted">
                        {file.lastModifiedBy ? `Saved by ${file.lastModifiedBy}` : 'Saved'}
                        {formatSavedAt(file.lastModifiedIso) ? ` · ${formatSavedAt(file.lastModifiedIso)}` : ''}
                      </span>
                    </button>
                    <button
                      className={`launcher-plan-delete${confirmDeleteId === file.itemId ? ' confirm' : ''}`}
                      disabled={busy}
                      onClick={() => { void handleDelete(file); }}
                      title={confirmDeleteId === file.itemId ? 'Click again to delete' : 'Delete plan'}
                    >
                      {confirmDeleteId === file.itemId ? 'Confirm' : '×'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
