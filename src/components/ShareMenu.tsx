import DropdownMenu from './DropdownMenu';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
  onExportPNG?: () => void;
  onExportPDF?: () => void;
  onExportSwimlanes?: () => void;
  onEmailNotes?: () => void;
}

/** Share menu — every way the plan leaves the app (design system: toolbar
 * card). Exports moved here from the old File menu. */
export default function ShareMenu({ anchor, onClose, onExportPNG, onExportPDF, onExportSwimlanes, onEmailNotes }: Props) {
  const item = (label: string, action?: () => void) => action ? (
    <div className="menu-item-action" onClick={() => { action(); onClose(); }}>
      {label}
    </div>
  ) : null;

  return (
    <DropdownMenu anchor={anchor} onClose={onClose}>
      {item('Export PNG', onExportPNG)}
      {item('Export PDF', onExportPDF)}
      {item('Export swimlanes (CSV)', onExportSwimlanes)}
      <div className="view-menu-divider" />
      {item('Email notes…', onEmailNotes)}
    </DropdownMenu>
  );
}
