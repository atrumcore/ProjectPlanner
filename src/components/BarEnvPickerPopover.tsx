import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGanttStore } from '../store/useGanttStore';

interface Props {
  barId: string;
  currentEnvId: string | null;
  /** Anchor in viewport coordinates (typically the click event clientX/Y). */
  x: number;
  y: number;
  onClose: () => void;
}

export default function BarEnvPickerPopover({ barId, currentEnvId, x, y, onClose }: Props) {
  const environments = useGanttStore(s => s.environments);
  const setBarEnvironment = useGanttStore(s => s.setBarEnvironment);
  const toggleEnvironmentsPanel = useGanttStore(s => s.toggleEnvironmentsPanel);
  const environmentsPanelOpen = useGanttStore(s => s.environmentsPanelOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp to viewport on mount.
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - rect.width - 4),
      top: Math.min(y + 6, window.innerHeight - rect.height - 4),
    });
  }, [x, y]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onClick);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="bar-env-popover"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="bar-env-popover-title">Environment</div>
      <button
        className={`bar-env-popover-item${currentEnvId === null ? ' active' : ''}`}
        onClick={() => { setBarEnvironment(barId, null); onClose(); }}
      >
        <span className="bar-env-popover-dot bar-env-popover-dot-none" />
        <span className="bar-env-popover-name">(none)</span>
      </button>
      {environments.map(env => (
        <button
          key={env.id}
          className={`bar-env-popover-item${currentEnvId === env.id ? ' active' : ''}`}
          onClick={() => { setBarEnvironment(barId, env.id); onClose(); }}
        >
          <span className="bar-env-popover-dot" style={{ background: env.color }} />
          <span className="bar-env-popover-name">{env.name}</span>
          {currentEnvId === env.id && <span className="bar-env-popover-check">✓</span>}
        </button>
      ))}
      <div className="bar-env-popover-divider" />
      <button
        className="bar-env-popover-link"
        onClick={() => {
          if (!environmentsPanelOpen) toggleEnvironmentsPanel();
          onClose();
        }}
      >
        Manage environments…
      </button>
    </div>,
    document.body
  );
}
