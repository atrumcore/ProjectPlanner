import { useCallback, useMemo, useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { DependencyItem } from '../types/gantt';
import { htmlToPlainText } from '../utils/plainText';

const PLAN_LEVEL_FILTER_ID = '__plan__';

/** One dependency: what it is, who's chasing it, and which projects it blocks.
 * The project chips are the sharing affordance — the same dependency can be
 * attached to as many projects as it actually blocks. */
function DependencyRow({ item }: { item: DependencyItem }) {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const updateDependencyItem = useGanttStore(s => s.updateDependencyItem);
  const removeDependencyItem = useGanttStore(s => s.removeDependencyItem);
  const toggleDependencyItemProject = useGanttStore(s => s.toggleDependencyItemProject);

  const [editingText, setEditingText] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [linking, setLinking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const laneName = useCallback((id: string) => {
    const lane = swimlanes.find(s => s.id === id);
    return lane ? htmlToPlainText(lane.projectName) || 'Untitled project' : 'Deleted project';
  }, [swimlanes]);

  const unlinked = swimlanes.filter(s => !item.swimlaneIds.includes(s.id));

  return (
    <div className={`dep-row${item.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        className="dep-row-checkbox"
        checked={item.done}
        title={item.done ? 'Mark as still outstanding' : 'Mark as cleared'}
        onChange={() => updateDependencyItem(item.id, { done: !item.done })}
      />
      <div className="dep-row-content">
        <div className="dep-row-top">
          {editingText ? (
            <input
              className="dep-row-text-input"
              autoFocus
              defaultValue={item.text}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v) updateDependencyItem(item.id, { text: v });
                setEditingText(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingText(false);
              }}
            />
          ) : (
            <span className="dep-row-text" onClick={() => setEditingText(true)} title="Click to edit">
              {item.text}
            </span>
          )}
          <button
            className={`dep-row-delete${confirmDelete ? ' confirm' : ''}`}
            title={confirmDelete ? 'Click again to delete' : 'Delete dependency'}
            onClick={() => {
              if (confirmDelete) removeDependencyItem(item.id);
              else setConfirmDelete(true);
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Sure?' : '×'}
          </button>
        </div>

        <div className="dep-row-meta">
          {/* Blocked projects — the count IS the impact signal. */}
          {item.swimlaneIds.map(id => (
            <button
              key={id}
              className="dep-chip"
              title={`Blocks ${laneName(id)} — click to unlink`}
              onClick={() => toggleDependencyItemProject(item.id, id)}
            >
              {laneName(id)} <span className="dep-chip-x">&times;</span>
            </button>
          ))}
          {item.swimlaneIds.length === 0 && (
            <span className="dep-chip-none">Plan-level</span>
          )}

          {linking && unlinked.length > 0 ? (
            <select
              className="dep-link-select"
              autoFocus
              defaultValue=""
              onBlur={() => setLinking(false)}
              onChange={e => {
                if (e.target.value) toggleDependencyItemProject(item.id, e.target.value);
                setLinking(false);
              }}
            >
              <option value="">Add project…</option>
              {unlinked.map(s => (
                <option key={s.id} value={s.id}>{htmlToPlainText(s.projectName)}</option>
              ))}
            </select>
          ) : unlinked.length > 0 && (
            <button className="dep-link-btn" title="Also blocks…" onClick={() => setLinking(true)}>
              + project
            </button>
          )}

          {editingOwner ? (
            <input
              className="dep-owner-input"
              autoFocus
              defaultValue={item.owner}
              placeholder="Owner"
              onBlur={e => {
                updateDependencyItem(item.id, { owner: e.target.value.trim() });
                setEditingOwner(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingOwner(false);
              }}
            />
          ) : (
            <button
              className={`dep-owner${item.owner ? '' : ' empty'}`}
              title="Who is chasing this"
              onClick={() => setEditingOwner(true)}
            >
              {item.owner || '+ owner'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Key Dependencies rail tab. Dependencies are shared items, not per-project
 * text, so the list is ordered by impact — most-blocked first — which answers
 * "what's holding up the most work?" at a glance. Filtering scopes it to one
 * project (the canvas badge sets that filter).
 */
export default function DependenciesPanel() {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const dependencyItems = useGanttStore(s => s.dependencyItems);
  const filterId = useGanttStore(s => s.dependenciesFilterId);
  const openDependenciesForSwimlane = useGanttStore(s => s.openDependenciesForSwimlane);
  const addDependencyItem = useGanttStore(s => s.addDependencyItem);

  const [newText, setNewText] = useState('');
  const [newSwimlane, setNewSwimlane] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!filterId) return dependencyItems;
    if (filterId === PLAN_LEVEL_FILTER_ID) return dependencyItems.filter(d => d.swimlaneIds.length === 0);
    return dependencyItems.filter(d => d.swimlaneIds.includes(filterId));
  }, [dependencyItems, filterId]);

  // Outstanding first, then by how many projects they block, then newest.
  const sorted = useMemo(() => [...filtered].sort((a, b) =>
    Number(a.done) - Number(b.done)
    || b.swimlaneIds.length - a.swimlaneIds.length
    || b.createdAt.localeCompare(a.createdAt)
  ), [filtered]);

  const open = sorted.filter(d => !d.done);
  const done = sorted.filter(d => d.done);

  const handleAdd = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    // Default the link to whatever the panel is scoped to, so adding from a
    // project's badge lands on that project without extra clicks.
    const target = newSwimlane ?? (filterId && filterId !== PLAN_LEVEL_FILTER_ID ? filterId : null);
    addDependencyItem(text, target ? [target] : []);
    setNewText('');
  }, [newText, newSwimlane, filterId, addDependencyItem]);

  return (
    <>
      <div className="notes-panel-filter-bar">
        <label htmlFor="dep-filter-select">Show:</label>
        <select
          id="dep-filter-select"
          value={filterId ?? ''}
          onChange={e => openDependenciesForSwimlane(e.target.value || null)}
        >
          <option value="">All projects</option>
          <option value={PLAN_LEVEL_FILTER_ID}>Plan-level</option>
          {swimlanes.map(s => (
            <option key={s.id} value={s.id}>{htmlToPlainText(s.projectName)}</option>
          ))}
        </select>
      </div>

      <div className="notes-panel-add-row">
        <input
          placeholder="What are we waiting on?"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <select
          value={newSwimlane ?? (filterId && filterId !== PLAN_LEVEL_FILTER_ID ? filterId : '')}
          onChange={e => setNewSwimlane(e.target.value || null)}
          title="Which project this blocks"
        >
          <option value="">Plan-level</option>
          {swimlanes.map(s => (
            <option key={s.id} value={s.id}>{htmlToPlainText(s.projectName)}</option>
          ))}
        </select>
      </div>

      <div className="notes-panel-list">
        {open.map(item => <DependencyRow key={item.id} item={item} />)}
        {done.length > 0 && <div className="notes-panel-divider">Cleared</div>}
        {done.map(item => <DependencyRow key={item.id} item={item} />)}
        {sorted.length === 0 && (
          <div className="teach-state">
            <div className="kicker">Key Dependencies</div>
            <p>
              {filterId
                ? 'Nothing outstanding for this filter.'
                : 'Track what the plan is waiting on — a vendor, an upstream API, a sign-off. One dependency can block several projects; outstanding counts show on each project row.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
