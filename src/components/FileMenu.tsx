import { useGanttStore } from '../store/useGanttStore';
import { isFileSystemAccessSupported } from '../utils/fileSystemAccess';
import DropdownMenu from './DropdownMenu';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
  onExportPNG?: () => void;
  onExportPDF?: () => void;
  onEmailNotes?: () => void;
}

export default function FileMenu({ anchor, onClose, onExportPNG, onExportPDF, onEmailNotes }: Props) {
  const newFile = useGanttStore(s => s.newFile);
  const openFile = useGanttStore(s => s.openFile);
  const saveFile = useGanttStore(s => s.saveFile);
  const saveFileAs = useGanttStore(s => s.saveFileAs);
  const supported = isFileSystemAccessSupported();

  const item = (label: string, action: () => void, shortcut?: string, disabled?: boolean) => (
    <div
      className="menu-item-action"
      aria-disabled={disabled || undefined}
      onClick={() => { if (!disabled) { action(); onClose(); } }}
    >
      {label}
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
    </div>
  );

  return (
    <DropdownMenu anchor={anchor} onClose={onClose}>
      {item('New', newFile, 'Ctrl+N', !supported)}
      {item('Open', openFile, 'Ctrl+O', !supported)}
      {item('Save', saveFile, 'Ctrl+S', !supported)}
      {item('Save As', saveFileAs, 'Ctrl+Shift+S', !supported)}
      {(onExportPNG || onExportPDF || onEmailNotes) && <div className="view-menu-divider" />}
      {onExportPNG && item('Export PNG', onExportPNG)}
      {onExportPDF && item('Export PDF', onExportPDF)}
      {onEmailNotes && item('Email Notes…', onEmailNotes)}
    </DropdownMenu>
  );
}
