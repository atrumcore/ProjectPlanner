import { useEffect, useRef, useState } from 'react';
import type { PhaseType } from '../types/gantt';
import { useGanttStore } from '../store/useGanttStore';

interface Props {
  x: number;
  y: number;
  barId: string;
  currentEnvId: string | null;
  onChangePhase: (phaseType: PhaseType) => void;
  onEditLabel: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ContextMenu({ x, y, barId, currentEnvId, onChangePhase, onEditLabel, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const environments = useGanttStore(s => s.environments);
  const togglePhaseTypesModal = useGanttStore(s => s.togglePhaseTypesModal);
  const toggleEnvironmentsPanel = useGanttStore(s => s.toggleEnvironmentsPanel);
  const environmentsPanelOpen = useGanttStore(s => s.environmentsPanelOpen);
  const setBarEnvironment = useGanttStore(s => s.setBarEnvironment);

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
      {phaseTypes.map(t => (
        <div
          key={t.id}
          className="context-menu-item"
          onClick={() => onChangePhase(t.id)}
        >
          <span
            className="color-swatch"
            style={{ background: t.fill, borderColor: t.stroke }}
          />
          {t.name}
        </div>
      ))}
      <div
        className="context-menu-item"
        style={{ color: '#7a7264', fontStyle: 'italic' }}
        onClick={() => { onClose(); togglePhaseTypesModal(); }}
      >
        + Manage phase types…
      </div>
      <div className="context-menu-divider" />
      <div className="context-menu-label">Environment</div>
      <div
        className="context-menu-item"
        onClick={() => {
          setBarEnvironment(barId, null);
          onClose();
        }}
      >
        {currentEnvId === null ? '✓ ' : ''}<span style={{ opacity: 0.6 }}>(none)</span>
      </div>
      {environments.map(env => (
        <div
          key={env.id}
          className="context-menu-item"
          onClick={() => {
            setBarEnvironment(barId, env.id);
            onClose();
          }}
        >
          <span
            className="context-menu-color-dot"
            style={{ background: env.color }}
          />
          {currentEnvId === env.id ? '✓ ' : ''}{env.name}
        </div>
      ))}
      <div
        className="context-menu-item"
        style={{ color: '#7a7264', fontStyle: 'italic' }}
        onClick={() => {
          onClose();
          if (!environmentsPanelOpen) toggleEnvironmentsPanel();
        }}
      >
        + Manage environments…
      </div>
      <div className="context-menu-divider" />
      <div className="context-menu-item" style={{ color: '#b52222' }} onClick={onDelete}>
        Delete
      </div>
    </div>
  );
}
