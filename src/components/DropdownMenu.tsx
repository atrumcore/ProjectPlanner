import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Portal-based dropdown anchored below a toolbar button.
 * Handles viewport clamping and outside-click dismissal.
 */
export default function DropdownMenu({ anchor, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  // Clamp to viewport after first render.
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(anchor.left, window.innerWidth - rect.width - 4),
      top: Math.min(anchor.bottom + 4, window.innerHeight - rect.height - 4),
    });
  }, [anchor]);

  // Dismiss on outside click.
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handle);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="dropdown-menu" style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>,
    document.body
  );
}
