import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { PhaseType } from '../types/gantt';
import { getPhaseDef } from '../data/phasePresets';

interface Props {
  onClose: () => void;
}

export default function AddPhaseBarModal({ onClose }: Props) {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const addPhaseBar = useGanttStore(s => s.addPhaseBar);
  const phaseTypes = useGanttStore(s => s.phaseTypes);

  const initialType = phaseTypes[0]?.id ?? 'custom';
  const initialDef = getPhaseDef(initialType, phaseTypes);
  const [swimlaneId, setSwimlaneId] = useState(swimlanes[0]?.id || '');
  const [phaseType, setPhaseType] = useState<PhaseType>(initialType);
  const [label, setLabel] = useState(initialDef.label);
  const [startWeek, setStartWeek] = useState(0);
  const [durationWeeks, setDurationWeeks] = useState(4);

  const handleTypeChange = (type: PhaseType) => {
    setPhaseType(type);
    setLabel(getPhaseDef(type, phaseTypes).label);
  };
  const previewDef = getPhaseDef(phaseType, phaseTypes);

  const handleAdd = () => {
    if (!swimlaneId || !label.trim()) return;
    addPhaseBar({
      swimlaneId,
      phaseType,
      label: label.trim(),
      startWeek,
      durationWeeks: Math.max(1, durationWeeks),
      environmentId: null,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Phase Bar</h2>

        <label>Swimlane</label>
        <select value={swimlaneId} onChange={e => setSwimlaneId(e.target.value)}>
          {swimlanes.map(s => (
            <option key={s.id} value={s.id}>{s.projectName}</option>
          ))}
        </select>

        <label>Phase Type</label>
        <select value={phaseType} onChange={e => handleTypeChange(e.target.value as PhaseType)}>
          {phaseTypes.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <label>Label</label>
        <input value={label} onChange={e => setLabel(e.target.value)} />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Start Week</label>
            <input
              type="number"
              min={0}
              value={startWeek}
              onChange={e => setStartWeek(Number(e.target.value))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Duration (weeks)</label>
            <input
              type="number"
              min={1}
              value={durationWeeks}
              onChange={e => setDurationWeeks(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#74706a' }}>Preview:</span>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 12px',
              borderRadius: 8,
              background: previewDef.fill,
              border: `1px solid ${previewDef.stroke}`,
              color: previewDef.text,
              fontSize: 8,
              fontWeight: 700,
            }}
          >
            {label}
          </span>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleAdd}>Add</button>
        </div>
      </div>
    </div>
  );
}
