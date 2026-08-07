import { useMemo, useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { getContentions, getPeopleContentions } from '../utils/contention';
import { formatSavedAt } from '../utils/dateUtils';
import { useAuthStore } from '../auth/useAuthStore';
import AccountChip from './AccountChip';
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
  const notesPanelOpen = useGanttStore(s => s.notesPanelOpen);
  const toggleNotesPanel = useGanttStore(s => s.toggleNotesPanel);
  const actionItems = useGanttStore(s => s.actionItems);
  const openCount = actionItems.filter(i => !i.done).length;

  const environments = useGanttStore(s => s.environments);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const showContention = useGanttStore(s => s.showContention);
  const environmentsPanelOpen = useGanttStore(s => s.environmentsPanelOpen);
  const toggleEnvironmentsPanel = useGanttStore(s => s.toggleEnvironmentsPanel);
  const contentionCount = useMemo(
    () => showContention ? getContentions({ environments, swimlanes, phaseBars }).length : 0,
    [environments, swimlanes, phaseBars, showContention]
  );

  const people = useGanttStore(s => s.people);
  const teams = useGanttStore(s => s.teams);
  const showPeopleContention = useGanttStore(s => s.showPeopleContention);
  const peoplePanelOpen = useGanttStore(s => s.peoplePanelOpen);
  const togglePeoplePanel = useGanttStore(s => s.togglePeoplePanel);
  const peopleContentionCount = useMemo(
    () => showPeopleContention ? getPeopleContentions({ people, teams, phaseBars }).length : 0,
    [people, teams, phaseBars, showPeopleContention]
  );

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
            <span className="toolbar-brand-mark" aria-hidden="true" />
            BBD Project Planner
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

        <button
          onClick={toggleNotesPanel}
          title="Notes & Action Items (Ctrl+Shift+N)"
          style={notesPanelOpen ? { background: 'var(--accent-secondary)', color: '#ffffff', borderColor: 'var(--accent-secondary)' } : undefined}
        >
          Notes{openCount > 0 && <span className="toolbar-notes-badge">{openCount}</span>}
        </button>

        <button
          onClick={toggleEnvironmentsPanel}
          title="Environments & Contention (Ctrl+Shift+E)"
          style={environmentsPanelOpen ? { background: 'var(--accent-secondary)', color: '#ffffff', borderColor: 'var(--accent-secondary)' } : undefined}
        >
          Environments{contentionCount > 0 && <span className="toolbar-env-badge">{contentionCount}</span>}
        </button>

        <button
          onClick={togglePeoplePanel}
          title="People & Teams (Ctrl+Shift+P)"
          style={peoplePanelOpen ? { background: 'var(--accent-secondary)', color: '#ffffff', borderColor: 'var(--accent-secondary)' } : undefined}
        >
          People{peopleContentionCount > 0 && <span className="toolbar-env-badge">{peopleContentionCount}</span>}
        </button>

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
