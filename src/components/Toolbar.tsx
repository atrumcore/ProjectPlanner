import { useRef, useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { formatSavedAt } from '../utils/dateUtils';
import { useAuthStore } from '../auth/useAuthStore';
import AccountChip from './AccountChip';
import FileMenu from './FileMenu';
import DisplayMenu from './DisplayMenu';
import ShareMenu from './ShareMenu';
import logoWhite from '../assets/bbd-logo-white.svg';
import logoBlack from '../assets/bbd-logo-black.svg';

type MenuId = 'file' | 'display' | 'share';

interface Props {
  onScrollToToday?: () => void;
  onExportPNG?: () => void;
  onExportPDF?: () => void;
  onExportSwimlanes?: () => void;
  onEmailNotes?: () => void;
  onSetDisplayName?: () => void;
}

/**
 * The 7-control toolbar (design system: toolbar card): ① brand mark = Home
 * when signed in · ② document chip opens the File menu, carries the dirty dot
 * and saved-by tooltip · ③ Today · ④ Display (presets) · ⑤ Share (exports) ·
 * ⑥ account. Gone: File/Insert/View buttons, panel buttons (→ rail), zoom
 * (→ floating cluster on the canvas), Undo/Redo buttons (→ Ctrl+Z/Y).
 */
export default function Toolbar({ onScrollToToday, onExportPNG, onExportPDF, onExportSwimlanes, onEmailNotes, onSetDisplayName }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  const currentFileName = useGanttStore(s => s.currentFileName);
  const isDirty = useGanttStore(s => s.isDirty);
  const fileMeta = useGanttStore(s => s.fileMeta);
  const setAppView = useGanttStore(s => s.setAppView);
  const signedIn = useAuthStore(s => s.account !== null);

  // Clicking a button whose menu is already open must CLOSE it. The menu's
  // outside-click handler fires on mousedown (before this click), setting
  // openMenu to null — so by click time a naive toggle would reopen it.
  // Remember at pointerdown whether this button's menu was open and swallow
  // the follow-up click if so.
  const suppressReopen = useRef(false);

  const rememberOpenState = (id: MenuId) => {
    suppressReopen.current = openMenu === id;
  };

  const toggleMenu = (id: MenuId, e: React.MouseEvent<HTMLElement>) => {
    if (suppressReopen.current) {
      suppressReopen.current = false;
      return;
    }
    setMenuAnchor(e.currentTarget.getBoundingClientRect());
    setOpenMenu(id);
  };

  const closeMenu = () => setOpenMenu(null);

  const menuBtnStyle = (id: MenuId) => ({
    background: openMenu === id ? 'var(--accent-secondary)' : undefined,
    color: openMenu === id ? '#ffffff' : undefined,
    borderColor: openMenu === id ? 'var(--accent-secondary)' : undefined,
  });

  const savedByTitle = fileMeta?.savedBy
    ? `Saved by ${fileMeta.savedBy}${formatSavedAt(fileMeta.savedAtIso) ? ` · ${formatSavedAt(fileMeta.savedAtIso)}` : ''}`
    : undefined;

  return (
    <>
      <div className="toolbar">
        {signedIn ? (
          <button
            className="toolbar-logo-btn"
            onClick={() => setAppView('launcher')}
            title="Home — back to your plans"
          >
            <img className="bbd-logo bbd-logo-white" src={logoWhite} alt="BBD" />
            <img className="bbd-logo bbd-logo-black" src={logoBlack} alt="BBD" />
          </button>
        ) : (
          <span className="toolbar-logo-btn" aria-hidden="true">
            <img className="bbd-logo bbd-logo-white" src={logoWhite} alt="BBD" />
            <img className="bbd-logo bbd-logo-black" src={logoBlack} alt="BBD" />
          </span>
        )}

        {/* Labelled path back to the launcher — the logo alone is an
            invisible convention. Hidden signed-out until Home exists for
            everyone (R5). */}
        {signedIn && (
          <button onClick={() => setAppView('launcher')} title="Back to your plans">
            &#x2039; Home
          </button>
        )}

        <button
          className="toolbar-doc-chip"
          onPointerDown={() => rememberOpenState('file')}
          onClick={e => toggleMenu('file', e)}
          title={savedByTitle ?? 'File menu'}
          style={openMenu === 'file' ? { background: 'var(--hover-strong)' } : undefined}
        >
          <span className="toolbar-doc-name">{currentFileName || 'Untitled'}</span>
          {isDirty && <span className="toolbar-filename-dirty" title="Unsaved changes">&bull;</span>}
          <span className="toolbar-doc-caret">&#x25BE;</span>
        </button>

        {onScrollToToday && (
          <button onClick={onScrollToToday} title="Scroll the timeline to today">Today</button>
        )}

        <div className="toolbar-spacer" />

        <button onPointerDown={() => rememberOpenState('display')} onClick={e => toggleMenu('display', e)} style={menuBtnStyle('display')} title="Presets, theme & timeline range">
          Display &#x25BE;
        </button>
        <button onPointerDown={() => rememberOpenState('share')} onClick={e => toggleMenu('share', e)} style={menuBtnStyle('share')} title="Export PNG / PDF / CSV & email notes">
          Share &#x25BE;
        </button>

        <AccountChip />
      </div>

      {openMenu === 'file' && menuAnchor && (
        <FileMenu anchor={menuAnchor} onClose={closeMenu} onSetDisplayName={onSetDisplayName} />
      )}
      {openMenu === 'display' && menuAnchor && (
        <DisplayMenu anchor={menuAnchor} onClose={closeMenu} />
      )}
      {openMenu === 'share' && menuAnchor && (
        <ShareMenu anchor={menuAnchor} onClose={closeMenu} onExportPNG={onExportPNG} onExportPDF={onExportPDF} onExportSwimlanes={onExportSwimlanes} onEmailNotes={onEmailNotes} />
      )}
    </>
  );
}
