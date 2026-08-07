import { useEffect, useRef, useState, type ReactNode } from 'react';

const PANEL_MIN = 300;
const PANEL_MAX = 720;
const PANEL_DEFAULT = 400;

interface Props {
  title: string;
  onClose: () => void;
  /** Extra header buttons, right-aligned before the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
}

/**
 * Shared shell for every rail tab's panel: one width (shared across tabs, one
 * resize handle on the left edge), one header, one close affordance. Sits
 * in-flow between the canvas and the rail strip — layer 1, border only, never
 * floating over content. Tab contents render as children.
 */
export default function RailPanel({ title, onClose, headerActions, children }: Props) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return;
      const delta = resizing.current.startX - e.clientX;
      setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, resizing.current.startWidth + delta)));
    };
    const onUp = () => { resizing.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <div className="rail-panel" style={{ width }}>
      <div
        className="rail-panel-resize"
        onPointerDown={e => {
          e.preventDefault();
          (e.target as Element).setPointerCapture(e.pointerId);
          resizing.current = { startX: e.clientX, startWidth: width };
        }}
      />
      <div className="rail-panel-header">
        <span className="rail-panel-title kicker">{title}</span>
        <div className="rail-panel-header-actions">
          {headerActions}
          <button onClick={onClose} title="Close (Esc)" aria-label="Close">&times;</button>
        </div>
      </div>
      <div className="rail-panel-body">{children}</div>
    </div>
  );
}
