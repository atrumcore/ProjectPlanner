import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface Props {
  onClose: () => void;
  /** Preselect this section (e.g. opened from that section's add row). */
  initialSectionId?: string;
}

export default function AddSwimlaneModal({ onClose, initialSectionId }: Props) {
  const sections = useGanttStore(s => s.sections);
  const addSwimlane = useGanttStore(s => s.addSwimlane);
  const dialogProps = useModalDismiss(onClose);

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const [name, setName] = useState('');
  const [section, setSection] = useState(
    initialSectionId ?? (sortedSections[sortedSections.length - 1]?.id || '')
  );

  const handleAdd = () => {
    if (!name.trim()) return;
    addSwimlane(name.trim(), section);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} {...dialogProps}>
        <h2>Add swimlane</h2>
        <label>Project name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. New Feature Release"
        />
        <label>Section</label>
        <select value={section} onChange={e => setSection(e.target.value)}>
          {sortedSections.map(sec => (
            <option key={sec.id} value={sec.id}>{sec.label}</option>
          ))}
        </select>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleAdd}>Add</button>
        </div>
      </div>
    </div>
  );
}
