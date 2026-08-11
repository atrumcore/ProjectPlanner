import { useEffect } from 'react';

/**
 * Shared modal dismissal behaviour: Escape closes the dialog. Registered in
 * the capture phase and stops propagation so the app-level Escape cascade
 * (clear focus → deselect bar → close rail panel, GanttChart) doesn't also
 * fire underneath the dialog.
 *
 * Returns the a11y props to spread on the dialog surface element.
 */
export function useModalDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  return { role: 'dialog', 'aria-modal': true } as const;
}
