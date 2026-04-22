import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGanttStore } from '../store/useGanttStore';
import type { ActionItem } from '../types/gantt';
import { buildNotesEmail } from '../utils/notesEmail';

const GENERAL_FILTER_ID = '__general__';

function ActionItemRow({ item }: { item: ActionItem }) {
  const updateActionItem = useGanttStore(s => s.updateActionItem);
  const removeActionItem = useGanttStore(s => s.removeActionItem);
  const swimlanes = useGanttStore(s => s.swimlanes);

  const [editingText, setEditingText] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [editingSwimlane, setEditingSwimlane] = useState(false);

  const swimlaneName = useMemo(() => {
    if (!item.swimlaneId) return null;
    const lane = swimlanes.find(s => s.id === item.swimlaneId);
    return lane?.projectName || null;
  }, [item.swimlaneId, swimlanes]);

  return (
    <div
      className={`action-item-row${item.done ? ' done' : ''}`}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'link';
        e.dataTransfer.setData('application/x-action-item', item.id);
      }}
    >
      <input
        type="checkbox"
        className="action-item-checkbox"
        checked={item.done}
        onChange={() => updateActionItem(item.id, { done: !item.done })}
      />
      <div className="action-item-content">
        <div className="action-item-top-row">
          {editingText ? (
            <input
              className="action-item-text-input"
              autoFocus
              defaultValue={item.text}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v) updateActionItem(item.id, { text: v });
                setEditingText(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingText(false);
              }}
            />
          ) : (
            <span className="action-item-text" onClick={() => setEditingText(true)}>
              {item.text}
            </span>
          )}
          {editingSwimlane ? (
            <select
              autoFocus
              value={item.swimlaneId || ''}
              onChange={e => {
                updateActionItem(item.id, { swimlaneId: e.target.value || null });
                setEditingSwimlane(false);
              }}
              onBlur={() => setEditingSwimlane(false)}
              style={{ fontSize: 10, maxWidth: 110 }}
            >
              <option value="">General</option>
              {swimlanes.map(s => (
                <option key={s.id} value={s.id}>{s.projectName}</option>
              ))}
            </select>
          ) : swimlaneName ? (
            <span
              className="action-item-swimlane-tag"
              onClick={() => setEditingSwimlane(true)}
              title="Click to change deliverable"
            >
              {swimlaneName}
            </span>
          ) : (
            <span
              className="action-item-swimlane-tag unlinked"
              onClick={() => setEditingSwimlane(true)}
              title="Link to a deliverable"
            >+ Link</span>
          )}
        </div>
        <div className="action-item-meta">
          {editingOwner ? (
            <input
              className="action-item-owner-input"
              autoFocus
              defaultValue={item.owner}
              list="owner-suggestions"
              placeholder="Assign owner..."
              onBlur={e => {
                updateActionItem(item.id, { owner: e.target.value.trim() });
                setEditingOwner(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingOwner(false);
              }}
            />
          ) : (
            <span className="action-item-owner" onClick={() => setEditingOwner(true)}>
              {item.owner ? `@${item.owner}` : ''}
            </span>
          )}
        </div>
      </div>
      <button
        className="action-item-delete"
        onClick={() => removeActionItem(item.id)}
        title="Delete item"
      >
        &times;
      </button>
    </div>
  );
}

export default function NotesPanel() {
  const actionItems = useGanttStore(s => s.actionItems);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const currentFileName = useGanttStore(s => s.currentFileName);
  const addActionItem = useGanttStore(s => s.addActionItem);
  const clearDoneActionItems = useGanttStore(s => s.clearDoneActionItems);
  const toggleNotesPanel = useGanttStore(s => s.toggleNotesPanel);
  const notesPanelSwimlaneId = useGanttStore(s => s.notesPanelSwimlaneId);
  const notesPanelFilterId = useGanttStore(s => s.notesPanelFilterId);
  const setNotesPanelFilter = useGanttStore(s => s.setNotesPanelFilter);

  const [newText, setNewText] = useState('');
  const [selectedSwimlane, setSelectedSwimlane] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(360);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);

  const PANEL_MIN = 280;
  const PANEL_MAX = 700;

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

  // Init swimlane picker from store when opened via left panel [+] button
  useEffect(() => {
    if (notesPanelSwimlaneId) {
      setSelectedSwimlane(notesPanelSwimlaneId);
    }
  }, [notesPanelSwimlaneId]);

  // Auto-reset "clear done" confirmation after 3 seconds or when done count changes
  useEffect(() => { setConfirmClear(false); }, [actionItems]);
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const filtered = useMemo(() => {
    if (notesPanelFilterId === null) return actionItems;
    if (notesPanelFilterId === GENERAL_FILTER_ID) {
      return actionItems.filter(i => !i.swimlaneId);
    }
    return actionItems.filter(i => i.swimlaneId === notesPanelFilterId);
  }, [actionItems, notesPanelFilterId]);

  const openItems = useMemo(
    () => filtered.filter(i => !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filtered]
  );

  const doneItems = useMemo(
    () => filtered.filter(i => i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filtered]
  );

  const uniqueOwners = useMemo(
    () => [...new Set(actionItems.map(i => i.owner).filter(Boolean))],
    [actionItems]
  );

  const handleAdd = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    addActionItem(text, selectedSwimlane);
    setNewText('');
  }, [newText, selectedSwimlane, addActionItem]);

  const handleClose = useCallback(() => setClosing(true), []);

  const handleEmail = useCallback(() => {
    const { subject, body } = buildNotesEmail(swimlanes, sections, actionItems, currentFileName);
    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }, [swimlanes, sections, actionItems, currentFileName]);

  return createPortal(
    <div
      className={`notes-panel${closing ? ' notes-panel--closing' : ''}`}
      style={{ width }}
      onAnimationEnd={() => { if (closing) toggleNotesPanel(); }}
    >
      <div
        className="notes-panel-resize-handle"
        onPointerDown={e => {
          e.preventDefault();
          (e.target as Element).setPointerCapture(e.pointerId);
          resizing.current = { startX: e.clientX, startWidth: width };
        }}
      />
      <div className="notes-panel-header">
        <span>Notes & Action Items</span>
        <div className="notes-panel-header-actions">
          <button onClick={handleEmail} title="Email notes" aria-label="Email notes">&#x2709;</button>
          <button onClick={handleClose} title="Close (Ctrl+Shift+N)" aria-label="Close">&times;</button>
        </div>
      </div>

      <div className="notes-panel-filter-bar">
        <label htmlFor="notes-filter-select">Show:</label>
        <select
          id="notes-filter-select"
          value={notesPanelFilterId ?? ''}
          onChange={e => setNotesPanelFilter(e.target.value || null)}
        >
          <option value="">All</option>
          <option value={GENERAL_FILTER_ID}>General</option>
          {swimlanes.map(s => (
            <option key={s.id} value={s.id}>{s.projectName}</option>
          ))}
        </select>
      </div>

      <div className="notes-panel-add-row">
        <input
          placeholder="New action item..."
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <select
          value={selectedSwimlane || ''}
          onChange={e => setSelectedSwimlane(e.target.value || null)}
          title="Link to deliverable"
        >
          <option value="">General</option>
          {swimlanes.map(s => (
            <option key={s.id} value={s.id}>{s.projectName}</option>
          ))}
        </select>
      </div>

      <div className="notes-panel-list">
        {openItems.map(item => (
          <ActionItemRow key={item.id} item={item} />
        ))}
        {doneItems.length > 0 && (
          <div className="notes-panel-divider">Done</div>
        )}
        {doneItems.map(item => (
          <ActionItemRow key={item.id} item={item} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            {notesPanelFilterId ? 'No items matching this filter.' : 'No action items yet. Add one above.'}
          </div>
        )}
      </div>

      {doneItems.length > 0 && (
        <div className="notes-panel-footer">
          <button
            className={confirmClear ? 'confirm' : undefined}
            onClick={() => {
              if (confirmClear) { clearDoneActionItems(); setConfirmClear(false); }
              else setConfirmClear(true);
            }}
          >
            {confirmClear ? 'Click to confirm' : `Clear done (${doneItems.length})`}
          </button>
        </div>
      )}

      <datalist id="owner-suggestions">
        {uniqueOwners.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>,
    document.body
  );
}
