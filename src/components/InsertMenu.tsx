import { useGanttStore } from '../store/useGanttStore';
import DropdownMenu from './DropdownMenu';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
  onAddSwimlane: () => void;
  onAddFloatingNote: () => void;
}

export default function InsertMenu({ anchor, onClose, onAddSwimlane, onAddFloatingNote }: Props) {
  const addSection = useGanttStore(s => s.addSection);
  const togglePhaseTypesModal = useGanttStore(s => s.togglePhaseTypesModal);

  return (
    <DropdownMenu anchor={anchor} onClose={onClose}>
      <div
        className="menu-item-action"
        onClick={onAddSwimlane}
      >
        Swimlane
      </div>
      <div
        className="menu-item-action"
        onClick={() => { addSection('New Section'); onClose(); }}
      >
        Section
      </div>
      <div
        className="menu-item-action"
        onClick={() => { onAddFloatingNote(); onClose(); }}
      >
        Floating Note
      </div>
      <div
        className="menu-item-action"
        onClick={() => { togglePhaseTypesModal(); onClose(); }}
      >
        Phase Type…
      </div>
    </DropdownMenu>
  );
}
