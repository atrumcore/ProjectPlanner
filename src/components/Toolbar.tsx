import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { formatSavedAt } from '../utils/dateUtils';
import { useAuthStore } from '../auth/useAuthStore';
import AccountChip from './AccountChip';
import FileMenu from './FileMenu';
import InsertMenu from './InsertMenu';
import ViewMenu from './ViewMenu';
import AddSwimlaneModal from './AddSwimlaneModal';
import logoWhite from '../assets/bbd-logo-white.svg';
import logoBlack from '../assets/bbd-logo-black.svg';

type MenuId = 'file' | 'insert' | 'view';

interface Props {
  onScrollToToday?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onExportPNG?: () => void;
  onExportPDF?: () => void;
  onExportSwimlanes?: () => void;
  onEmailNotes?: () => void;
  onAddFloatingNote?: () => void;
  onSetDisplayName?: () => void;
}

export default function Toolbar({ onScrollToToday, onZoomIn, onZoomOut, onZoomReset, onExportPNG, onExportPDF, onExportSwimlanes, onEmailNotes, onAddFloatingNote, onSetDisplayName }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [showAddSwimlane, setShowAddSwimlane] = useState(false);

  const currentFileName = useGanttStore(s => s.currentFileName);
  const isDirty = useGanttStore(s => s.isDirty);
  const fileMeta = useGanttStore(s => s.fileMeta);
  const setAppView = useGanttStore(s => s.setAppView);
  const signedIn = useAuthStore(s => s.account !== null);
  const undo = useGanttStore(s => s.undo);
  const redo = useGanttStore(s => s.redo);
  const canUndo = useGanttStore(s => s.canUndo);
  const canRedo = useGanttStore(s => s.canRedo);

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
    background: openMenu === id ? 'var(--accent-secondary)' : undefined,
    color: openMenu === id ? '#ffffff' : undefined,
    borderColor: openMenu === id ? 'var(--accent-secondary)' : undefined,
  });

  return (
    <>
      <div className="toolbar">
        <h1>
          <span className="toolbar-brand">
            <img className="bbd-logo bbd-logo-white" src={logoWhite} alt="BBD" />
            <img className="bbd-logo bbd-logo-black" src={logoBlack} alt="BBD" />
            Project Planner
          </span>
          <span className="toolbar-filename">
            {' \u2014 '}{currentFileName || 'Untitled'}
            {isDirty && <span className="toolbar-filename-dirty" title="Unsaved changes">&nbsp;&bull;</span>}
            {fileMeta?.savedBy && (
              <span className="toolbar-saved-by" title={fileMeta.savedAtIso ?? undefined}>
                {' \u00b7 '}saved by {fileMeta.savedBy}
                {formatSavedAt(fileMeta.savedAtIso) ? ` \u00b7 ${formatSavedAt(fileMeta.savedAtIso)}` : ''}
              </span>
            )}
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

        {signedIn && (
          <button onClick={() => setAppView('launcher')} title="Back to your plans">
            Home
          </button>
        )}

        {onScrollToToday && <button onClick={onScrollToToday}>Today</button>}

        <div className="toolbar-spacer" />

        {onZoomOut && <button onClick={onZoomOut} title="Zoom out (Ctrl+Scroll)">-</button>}
        {onZoomReset && <button onClick={onZoomReset} title="Reset zoom">100%</button>}
        {onZoomIn && <button onClick={onZoomIn} title="Zoom in (Ctrl+Scroll)">+</button>}

        <span className="toolbar-divider" />

        <button onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Y)">Redo</button>

        <AccountChip />
      </div>

      {openMenu === 'file' && menuAnchor && (
        <FileMenu anchor={menuAnchor} onClose={closeMenu} onExportPNG={onExportPNG} onExportPDF={onExportPDF} onExportSwimlanes={onExportSwimlanes} onEmailNotes={onEmailNotes} onSetDisplayName={onSetDisplayName} />
      )}
      {openMenu === 'insert' && menuAnchor && (
        <InsertMenu
          anchor={menuAnchor}
          onClose={closeMenu}
          onAddSwimlane={() => { setShowAddSwimlane(true); closeMenu(); }}
          onAddFloatingNote={() => { onAddFloatingNote?.(); }}
        />
      )}
      {openMenu === 'view' && menuAnchor && (
        <ViewMenu anchor={menuAnchor} onClose={closeMenu} />
      )}

      {showAddSwimlane && <AddSwimlaneModal onClose={() => setShowAddSwimlane(false)} />}
    </>
  );
}
