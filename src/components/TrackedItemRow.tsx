import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { TrackedItem, TrackedKind } from '../types/gantt';
import { KIND_META, KIND_ORDER } from '../data/trackedKinds';
import { htmlToPlainText } from '../utils/plainText';

/**
 * One row of the register, shared by every kind — the component whose absence
 * caused Notes and Dependencies to be built twice.
 *
 * Everything kind-specific comes from KIND_META, so the row never switches on
 * the union: the dot colour, the tooltip wording for `done`, and the label on
 * the kind chip. The chip is a picker, because "this risk just became an
 * issue" is the most common edit in a live RAID log and retyping the row to
 * do it would be absurd.
 */
export default function TrackedItemRow({ item }: { item: TrackedItem }) {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const people = useGanttStore(s => s.people);
  const updateTrackedItem = useGanttStore(s => s.updateTrackedItem);
  const removeTrackedItem = useGanttStore(s => s.removeTrackedItem);
  const toggleTrackedItemProject = useGanttStore(s => s.toggleTrackedItemProject);
  const activeFilterId = useGanttStore(s => s.trackedFilterSwimlaneId);

  const [editingText, setEditingText] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [editingKind, setEditingKind] = useState(false);
  const [linking, setLinking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = KIND_META[item.kind];
  const laneName = (id: string) => {
    const lane = swimlanes.find(s => s.id === id);
    return lane ? htmlToPlainText(lane.projectName) || 'Untitled project' : 'Deleted project';
  };
  const unlinked = swimlanes.filter(s => !item.swimlaneIds.includes(s.id));
  // Suppress only the chip for the project the panel is already filtered to.
  const shownLinks = item.swimlaneIds.filter(id => id !== activeFilterId);

  return (
    <div
      className={`item-row${item.done ? ' done' : ''}`}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'link';
        e.dataTransfer.setData('application/x-tracked-item', item.id);
      }}
    >
      <input
        type="checkbox"
        className="item-row-checkbox"
        checked={item.done}
        title={item.done ? `Reopen (currently ${meta.doneLabel.toLowerCase()})` : `Mark as ${meta.doneLabel.toLowerCase()}`}
        onChange={() => updateTrackedItem(item.id, { done: !item.done })}
      />
      <div className="item-row-content">
        <div className="item-row-top">
          {editingText ? (
            <input
              className="item-row-text-input"
              autoFocus
              defaultValue={item.text}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v) updateTrackedItem(item.id, { text: v });
                setEditingText(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingText(false);
              }}
            />
          ) : (
            <span className="item-row-text" onClick={() => setEditingText(true)} title="Click to edit">
              {item.text}
            </span>
          )}
          <button
            className={`item-row-delete${confirmDelete ? ' confirm' : ''}`}
            title={confirmDelete ? 'Click again to delete' : 'Delete item'}
            onClick={() => {
              if (confirmDelete) removeTrackedItem(item.id);
              else setConfirmDelete(true);
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Sure?' : '\u00d7'}
          </button>
        </div>

        <div className="item-row-meta">
          {editingKind ? (
            <select
              className="item-kind-select"
              autoFocus
              defaultValue={item.kind}
              onBlur={() => setEditingKind(false)}
              onChange={e => {
                updateTrackedItem(item.id, { kind: e.target.value as TrackedKind });
                setEditingKind(false);
              }}
            >
              {KIND_ORDER.map(k => (
                <option key={k} value={k}>{KIND_META[k].label}</option>
              ))}
            </select>
          ) : (
            <button
              className="item-kind-chip"
              style={{ ['--kind-color' as string]: meta.color }}
              title="Click to change type"
              onClick={() => setEditingKind(true)}
            >
              <span className="item-kind-dot" />
              {meta.short}
            </button>
          )}

          {/* A chip naming the project you have already filtered to tells you
              nothing — ten rows repeating "HANIS Switch" is noise competing
              with the item text. It reappears the moment the filter widens, so
              nothing is lost, and links to OTHER projects always show. */}
          {shownLinks.map(id => (
            <button
              key={id}
              className="item-chip"
              title={`${laneName(id)} — click to unlink`}
              onClick={() => toggleTrackedItemProject(item.id, id)}
            >
              {laneName(id)} <span className="item-chip-x">&times;</span>
            </button>
          ))}
          {item.swimlaneIds.length === 0 && <span className="item-chip-none">Plan-level</span>}

          {linking && unlinked.length > 0 ? (
            <select
              className="item-link-select"
              autoFocus
              defaultValue=""
              onBlur={() => setLinking(false)}
              onChange={e => {
                if (e.target.value) toggleTrackedItemProject(item.id, e.target.value);
                setLinking(false);
              }}
            >
              <option value="">Add project…</option>
              {unlinked.map(s => (
                <option key={s.id} value={s.id}>{htmlToPlainText(s.projectName)}</option>
              ))}
            </select>
          ) : unlinked.length > 0 && (
            <button className="item-link-btn" title="Also relates to…" onClick={() => setLinking(true)}>
              + project
            </button>
          )}

          {editingOwner ? (
            <input
              className="item-owner-input"
              autoFocus
              defaultValue={item.owner}
              list="owner-suggestions"
              placeholder="Owner"
              onBlur={e => {
                updateTrackedItem(item.id, { owner: e.target.value.trim() });
                setEditingOwner(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingOwner(false);
              }}
            />
          ) : (
            <button
              className={`item-owner${item.owner ? '' : ' empty'}`}
              title="Who owns or is chasing this"
              onClick={() => setEditingOwner(true)}
            >
              {item.owner ? `@${item.owner}` : '+ owner'}
            </button>
          )}
        </div>
      </div>
      <datalist id="owner-suggestions">
        {people.map(p => <option key={p.id} value={p.name} />)}
      </datalist>
    </div>
  );
}
