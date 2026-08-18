import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { TrackedKind } from '../types/gantt';
import { KIND_META, KIND_ORDER } from '../data/trackedKinds';
import { htmlToPlainText } from '../utils/plainText';
import TrackedItemRow from './TrackedItemRow';

const PLAN_LEVEL_FILTER_ID = '__plan__';

/**
 * The plan's register: everything tracked that isn't a bar on the chart.
 * Replaces the old Notes and Key Dependencies tabs, which had converged into
 * the same thing with different labels.
 *
 * Six kinds share one row shape, so the panel filters rather than branches.
 * Kind is a select rather than a lens strip because seven chips don't fit a
 * ~370px rail panel; the per-row dots carry the visual scan instead.
 */
export default function OpenItemsPanel() {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const trackedItems = useGanttStore(s => s.trackedItems);
  const filterSwimlaneId = useGanttStore(s => s.trackedFilterSwimlaneId);
  const filterKind = useGanttStore(s => s.trackedFilterKind);
  const setTrackedFilterSwimlane = useGanttStore(s => s.setTrackedFilterSwimlane);
  const setTrackedFilterKind = useGanttStore(s => s.setTrackedFilterKind);
  const addTrackedItem = useGanttStore(s => s.addTrackedItem);
  const clearDoneTrackedItems = useGanttStore(s => s.clearDoneTrackedItems);

  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState<TrackedKind>('action');
  const [newSwimlane, setNewSwimlane] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Adding from a project's badge should land on that project, and picking a
  // kind lens should pre-select that kind — no re-choosing what you just said.
  useEffect(() => {
    if (filterSwimlaneId && filterSwimlaneId !== PLAN_LEVEL_FILTER_ID) setNewSwimlane(filterSwimlaneId);
  }, [filterSwimlaneId]);
  useEffect(() => { if (filterKind) setNewKind(filterKind); }, [filterKind]);

  useEffect(() => { setConfirmClear(false); }, [trackedItems]);
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const filtered = useMemo(() => trackedItems.filter(d => {
    if (filterKind && d.kind !== filterKind) return false;
    if (!filterSwimlaneId) return true;
    if (filterSwimlaneId === PLAN_LEVEL_FILTER_ID) return d.swimlaneIds.length === 0;
    return d.swimlaneIds.includes(filterSwimlaneId);
  }), [trackedItems, filterKind, filterSwimlaneId]);

  // Outstanding first, then by how many projects it touches (impact), then
  // newest — so the top of the list answers "what's holding up the most?".
  const sorted = useMemo(() => [...filtered].sort((a, b) =>
    Number(a.done) - Number(b.done)
    || b.swimlaneIds.length - a.swimlaneIds.length
    || b.createdAt.localeCompare(a.createdAt)
  ), [filtered]);

  const open = sorted.filter(d => !d.done);
  const done = sorted.filter(d => d.done);

  // With a kind lens active the wording follows that kind (Cleared,
  // Mitigated…); across kinds there's no single right word, so: Done.
  const doneWord = filterKind ? KIND_META[filterKind].doneLabel : 'Done';

  const handleAdd = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    addTrackedItem(newKind, text, newSwimlane ? [newSwimlane] : []);
    setNewText('');
  }, [newText, newKind, newSwimlane, addTrackedItem]);

  return (
    <>
      <div className="notes-panel-filter-bar">
        <label htmlFor="items-kind-filter">Show:</label>
        <select
          id="items-kind-filter"
          value={filterKind ?? ''}
          onChange={e => setTrackedFilterKind((e.target.value || null) as TrackedKind | null)}
        >
          <option value="">All types</option>
          {KIND_ORDER.map(k => (
            <option key={k} value={k}>{KIND_META[k].plural}</option>
          ))}
        </select>
        <select
          id="items-project-filter"
          value={filterSwimlaneId ?? ''}
          onChange={e => setTrackedFilterSwimlane(e.target.value || null)}
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
          placeholder={KIND_META[newKind].hint}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <select
          value={newKind}
          onChange={e => setNewKind(e.target.value as TrackedKind)}
          title="Type"
        >
          {KIND_ORDER.map(k => (
            <option key={k} value={k}>{KIND_META[k].label}</option>
          ))}
        </select>
        <select
          value={newSwimlane ?? ''}
          onChange={e => setNewSwimlane(e.target.value || null)}
          title="Which project this relates to"
        >
          <option value="">Plan-level</option>
          {swimlanes.map(s => (
            <option key={s.id} value={s.id}>{htmlToPlainText(s.projectName)}</option>
          ))}
        </select>
      </div>

      <div className="notes-panel-list">
        {open.map(item => <TrackedItemRow key={item.id} item={item} />)}
        {done.length > 0 && <div className="notes-panel-divider">{doneWord}</div>}
        {done.map(item => <TrackedItemRow key={item.id} item={item} />)}
        {sorted.length === 0 && (
          <div className="teach-state">
            <div className="kicker">Open Items</div>
            <p>
              {filterKind || filterSwimlaneId
                ? 'Nothing matches this filter.'
                : 'One register for everything that isn\u2019t a bar on the chart \u2014 actions, dependencies, risks, issues, decisions and assumptions. An item can relate to several projects, and open counts show on each project row.'}
            </p>
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="notes-panel-footer">
          <button
            className={confirmClear ? 'confirm' : undefined}
            onClick={() => {
              if (confirmClear) { clearDoneTrackedItems(filterKind); setConfirmClear(false); }
              else setConfirmClear(true);
            }}
          >
            {confirmClear ? 'Sure?' : `Clear ${doneWord.toLowerCase()} (${done.length})`}
          </button>
        </div>
      )}
    </>
  );
}
