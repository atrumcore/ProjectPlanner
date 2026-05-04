import { useMemo, useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { deriveColorScheme } from '../data/phasePresets';

export default function ManagePhaseTypesModal() {
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const addPhaseType = useGanttStore(s => s.addPhaseType);
  const updatePhaseType = useGanttStore(s => s.updatePhaseType);
  const removePhaseType = useGanttStore(s => s.removePhaseType);
  const reorderPhaseTypes = useGanttStore(s => s.reorderPhaseTypes);
  const togglePhaseTypesModal = useGanttStore(s => s.togglePhaseTypesModal);
  const resetPhaseTypesToBuiltins = useGanttStore(s => s.resetPhaseTypesToBuiltins);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const usageCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of phaseBars) map.set(b.phaseType, (map.get(b.phaseType) || 0) + 1);
    return map;
  }, [phaseBars]);

  const handleClose = () => togglePhaseTypesModal();

  const handleNameBlur = (id: string, name: string, currentLabel: string, originalName: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // If the label matches the auto-uppercased name, keep that link alive.
    const wasAutoLabel = currentLabel === originalName.toUpperCase();
    updatePhaseType(id, {
      name: trimmed,
      ...(wasAutoLabel ? { label: trimmed.toUpperCase() } : {}),
    });
  };

  const handleFillChange = (id: string, fill: string) => {
    const scheme = deriveColorScheme(fill);
    updatePhaseType(id, scheme);
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      removePhaseType(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ordered = phaseTypes.map(t => t.id);
    const fromIdx = ordered.indexOf(dragId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, dragId);
    reorderPhaseTypes(ordered);
    setDragId(null);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal phase-types-modal" onClick={e => e.stopPropagation()}>
        <h2>Phase Types</h2>
        <p style={{ fontSize: 11, color: '#7a7264', margin: '0 0 12px' }}>
          Define the kinds of work blocks (Analysis, UAT, Smoke Test, …) that can be placed on the timeline.
          Each type controls a bar's color and label, and appears as a row in every environment's overlap rules.
        </p>

        <div className="phase-types-list">
          <div className="phase-types-row phase-types-row-header">
            <span />
            <span>Color</span>
            <span>Name</span>
            <span>Bar label</span>
            <span style={{ textAlign: 'right' }}>In use</span>
            <span />
          </div>
          {phaseTypes.map(t => {
            const inUse = usageCount.get(t.id) || 0;
            return (
              <div
                key={t.id}
                className={`phase-types-row${dragId === t.id ? ' dragging' : ''}`}
                draggable
                onDragStart={e => {
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={() => handleDrop(t.id)}
                onDragEnd={() => setDragId(null)}
              >
                <span className="phase-types-drag-handle" title="Drag to reorder">&#x2630;</span>
                <input
                  type="color"
                  className="phase-types-color"
                  value={t.fill}
                  onChange={e => handleFillChange(t.id, e.target.value)}
                  title={`Fill ${t.fill} · auto-derived stroke ${t.stroke} and text ${t.text}`}
                />
                <input
                  key={`${t.id}-name-${t.name}`}
                  type="text"
                  className="phase-types-name"
                  defaultValue={t.name}
                  placeholder="Phase type name"
                  onBlur={e => handleNameBlur(t.id, e.target.value, t.label, t.name)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
                <input
                  key={`${t.id}-label-${t.label}`}
                  type="text"
                  className="phase-types-label"
                  defaultValue={t.label}
                  placeholder="LABEL"
                  onBlur={e => {
                    const v = e.target.value.trim();
                    if (v) updatePhaseType(t.id, { label: v });
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
                <span className="phase-types-usage" title={inUse > 0 ? 'This type is referenced by phase bars; deleting will reassign them.' : 'Not used'}>
                  {inUse > 0 ? `${inUse}` : '—'}
                </span>
                <button
                  className={`phase-types-delete${confirmDeleteId === t.id ? ' confirm' : ''}`}
                  onClick={() => handleDelete(t.id)}
                  disabled={phaseTypes.length <= 1}
                  title={
                    phaseTypes.length <= 1
                      ? 'At least one phase type must remain'
                      : confirmDeleteId === t.id
                        ? 'Click again to confirm — bars using this type will move to the first remaining type'
                        : inUse > 0
                          ? `In use by ${inUse} bar(s) — deleting will reassign them`
                          : 'Delete'
                  }
                >
                  {confirmDeleteId === t.id ? '✓' : '×'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="phase-types-footer">
          <button
            className="btn-secondary"
            onClick={() => addPhaseType('New type', '#cccccc')}
          >
            + Add phase type
          </button>
          <button
            className={confirmReset ? 'btn-secondary confirm' : 'btn-secondary'}
            onClick={() => {
              if (confirmReset) {
                resetPhaseTypesToBuiltins();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
                setTimeout(() => setConfirmReset(false), 3000);
              }
            }}
            title="Replace the list with the original 7 built-in types"
          >
            {confirmReset ? 'Click to confirm reset' : 'Reset to defaults'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn-primary" onClick={handleClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
