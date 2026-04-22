import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import FileMenu from './FileMenu';
import InsertMenu from './InsertMenu';
import ViewMenu from './ViewMenu';
import AddSwimlaneModal from './AddSwimlaneModal';

type MenuId = 'file' | 'insert' | 'view';

interface Props {
  onScrollToToday?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onExportPNG?: () => void;
  onEmailNotes?: () => void;
}

export default function Toolbar({ onScrollToToday, onZoomIn, onZoomOut, onZoomReset, onExportPNG, onEmailNotes }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [showAddSwimlane, setShowAddSwimlane] = useState(false);

  const currentFileName = useGanttStore(s => s.currentFileName);
  const isDirty = useGanttStore(s => s.isDirty);
  const undo = useGanttStore(s => s.undo);
  const redo = useGanttStore(s => s.redo);
  const canUndo = useGanttStore(s => s.canUndo);
  const canRedo = useGanttStore(s => s.canRedo);
  const notesPanelOpen = useGanttStore(s => s.notesPanelOpen);
  const toggleNotesPanel = useGanttStore(s => s.toggleNotesPanel);
  const actionItems = useGanttStore(s => s.actionItems);
  const openCount = actionItems.filter(i => !i.done).length;

  const toggleMenu = (id: MenuId, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenu === id) {
      setOpenMenu(null);
    } else {
      setMenuAnchor(e.currentTarget.getBoundingClientRect());
      setOpenMenu(id);
    }
  };

  const closeMenu = () => setOpenMenu(null);

  const menuBtnStyle = (id: MenuId) => ({
    background: openMenu === id ? '#3d3930' : undefined,
    color: openMenu === id ? '#ede9e1' : undefined,
  });

  return (
    <>
      <div className="toolbar">
        <h1>
          DHA Priority Roadmap
          <span className="toolbar-filename">
            {' \u2014 '}{currentFileName || 'Untitled'}
            {isDirty && <span className="toolbar-filename-dirty" title="Unsaved changes">&nbsp;&bull;</span>}
          </span>
        </h1>

        <button onClick={e => toggleMenu('file', e)} style={menuBtnStyle('file')}>
          File &#x25BE;
        </button>
        <button onClick={e => toggleMenu('insert', e)} style={menuBtnStyle('insert')}>
          Insert &#x25BE;
        </button>
        <button onClick={e => toggleMenu('view', e)} style={menuBtnStyle('view')}>
          View &#x25BE;
        </button>

        <span className="toolbar-divider" />

        {onScrollToToday && <button onClick={onScrollToToday}>Today</button>}

        <button
          onClick={toggleNotesPanel}
          title="Notes & Action Items (Ctrl+Shift+N)"
          style={notesPanelOpen ? { background: '#3d3930', color: '#ede9e1' } : undefined}
        >
          Notes{openCount > 0 && <span className="toolbar-notes-badge">{openCount}</span>}
        </button>

        <div className="toolbar-spacer" />

        {onZoomOut && <button onClick={onZoomOut} title="Zoom out (Ctrl+Scroll)">-</button>}
        {onZoomReset && <button onClick={onZoomReset} title="Reset zoom">100%</button>}
        {onZoomIn && <button onClick={onZoomIn} title="Zoom in (Ctrl+Scroll)">+</button>}

        <span className="toolbar-divider" />

        <button onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Y)">Redo</button>
      </div>

      {openMenu === 'file' && menuAnchor && (
        <FileMenu anchor={menuAnchor} onClose={closeMenu} onExportPNG={onExportPNG} onEmailNotes={onEmailNotes} />
      )}
      {openMenu === 'insert' && menuAnchor && (
        <InsertMenu anchor={menuAnchor} onClose={closeMenu} onAddSwimlane={() => { setShowAddSwimlane(true); closeMenu(); }} />
      )}
      {openMenu === 'view' && menuAnchor && (
        <ViewMenu anchor={menuAnchor} onClose={closeMenu} />
      )}

      {showAddSwimlane && <AddSwimlaneModal onClose={() => setShowAddSwimlane(false)} />}
    </>
  );
}
