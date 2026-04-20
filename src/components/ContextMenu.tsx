import { useEffect, useRef, useState } from 'react';
import type { PhaseType } from '../types/gantt';
import { PHASE_PRESETS, PHASE_TYPE_OPTIONS } from '../data/phasePresets';

interface Props {
  x: number;
  y: number;
  onChangePhase: (phaseType: PhaseType) => void;
  onEditLabel: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ContextMenu({ x, y, onChangePhase, onEditLabel, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp to viewport after first render
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - rect.width - 4),
      top: Math.min(y, window.innerHeight - rect.height - 4),
    });
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: pos.left, top: pos.top }}>
      <div className="context-menu-item" onClick={onEditLabel}>
        Edit Label
      </div>
      <div className="context-menu-divider" />
      {PHASE_TYPE_OPTIONS.map(opt => (
        <div
          key={opt.value}
          className="context-menu-item"
          onClick={() => onChangePhase(opt.value)}
        >
          <span
            className="color-swatch"
            style={{ background: PHASE_PRESETS[opt.value].fill, borderColor: PHASE_PRESETS[opt.value].stroke }}
          />
          {opt.label}
        </div>
      ))}
      <div className="context-menu-divider" />
      <div className="context-menu-item" style={{ color: '#b52222' }} onClick={onDelete}>
        Delete
      </div>
    </div>
  );
}
