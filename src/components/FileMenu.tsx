import { useGanttStore } from '../store/useGanttStore';
import { useAuthStore } from '../auth/useAuthStore';
import DropdownMenu from './DropdownMenu';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
  onSetDisplayName?: () => void;
}

/** File menu — opens from the toolbar's document chip. File operations only;
 * exports live in the Share menu (design system: menus card). */
export default function FileMenu({ anchor, onClose, onSetDisplayName }: Props) {
  const newFile = useGanttStore(s => s.newFile);
  const openFile = useGanttStore(s => s.openFile);
  const saveFile = useGanttStore(s => s.saveFile);
  const saveFileAs = useGanttStore(s => s.saveFileAs);
  const setAppView = useGanttStore(s => s.setAppView);
  const signedIn = useAuthStore(s => s.account !== null);

  const item = (label: string, action: () => void, shortcut?: string) => (
    <div
      className="menu-item-action"
      onClick={() => { action(); onClose(); }}
    >
      {label}
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
    </div>
  );

  return (
    <DropdownMenu anchor={anchor} onClose={onClose}>
      {item('New', newFile, 'Ctrl+N')}
      {item('Open…', openFile, 'Ctrl+O')}
      {item('Save', saveFile, 'Ctrl+S')}
      {item('Save a copy…', saveFileAs, 'Ctrl+Shift+S')}
      <div className="view-menu-divider" />
      {signedIn
        ? item('Home', () => setAppView('launcher'))
        : (onSetDisplayName ? item('Set display name…', onSetDisplayName) : null)}
    </DropdownMenu>
  );
}
