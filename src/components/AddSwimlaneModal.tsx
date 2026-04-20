import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';

interface Props {
  onClose: () => void;
}

export default function AddSwimlaneModal({ onClose }: Props) {
  const sections = useGanttStore(s => s.sections);
  const addSwimlane = useGanttStore(s => s.addSwimlane);

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const [name, setName] = useState('');
  const [section, setSection] = useState(sortedSections[sortedSections.length - 1]?.id || '');

  const handleAdd = () => {
    if (!name.trim()) return;
    addSwimlane(name.trim(), section);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Swimlane</h2>
        <label>Project Name</label>
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
