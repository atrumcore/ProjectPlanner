import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import RichTextEditor from './RichTextEditor';

interface Props {
  /** Bounding rect of the cell that triggered the popover; used to anchor. */
  anchor: DOMRect;
  /** Swimlane the popover is editing — drives the title + value. */
  projectName: string;
  /** Eyebrow label naming the field being edited (defaults to Key Features). */
  title?: string;
  value: string;
  onSave: (html: string) => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 360;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 12;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;

/**
 * Focused detail popover for Key Features. Anchored to the right of the
 * triggering cell with auto-flip to the left when the right edge would
 * overflow the viewport. Embeds the existing RichTextEditor so editing
 * happens directly in the popover with the same blur-autosave contract.
 *
 * The header drags the popover around; the bottom-right corner resizes it.
 * Both mutate inline styles directly so dragging never re-renders the editor.
 *
 * Dismiss paths: Esc · backdrop click · close button.
 */
export default function KeyFeaturesPopover({ anchor, projectName, title = 'Key features', value, onSave, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position the popover by mutating its inline style after measuring its
  // actual height. We avoid useState for the coordinates so React doesn't
  // schedule an extra render just to move it.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const h = el.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + ANCHOR_GAP;
    if (left + POPOVER_WIDTH > vw - VIEWPORT_MARGIN) {
      // Not enough room on the right — flip to the left of the anchor.
      left = Math.max(VIEWPORT_MARGIN, anchor.left - POPOVER_WIDTH - ANCHOR_GAP);
    }
    let top = anchor.top - 6;
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - h - VIEWPORT_MARGIN));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [anchor]);

  // Drag-to-move via the header. Position mutates inline styles (same
  // rationale as the anchoring effect: no re-render mid-drag).
  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    // The close button keeps its click behaviour.
    if ((e.target as HTMLElement).closest('.key-features-popover-close')) return;
    const el = popoverRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    el.classList.add('is-dragging');
    const onMove = (ev: PointerEvent) => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(ev.clientX - offsetX, window.innerWidth - w - VIEWPORT_MARGIN));
      const top = Math.max(VIEWPORT_MARGIN, Math.min(ev.clientY - offsetY, window.innerHeight - h - VIEWPORT_MARGIN));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    const onUp = () => {
      el.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  // Resize via the bottom-right corner grip. Once the user resizes we pin an
  // explicit width/height (and lift the CSS max-height cap) so the popover
  // keeps the chosen size; the body scrolls within it.
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    const el = popoverRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    const onMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(MIN_WIDTH, Math.min(startW + ev.clientX - startX, window.innerWidth - rect.left - VIEWPORT_MARGIN));
      const h = Math.max(MIN_HEIGHT, Math.min(startH + ev.clientY - startY, window.innerHeight - rect.top - VIEWPORT_MARGIN));
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  // RichTextEditor saves on blur. Make sure that fires before we unmount by
  // explicitly blurring the editor if it currently has focus, then closing.
  const handleClose = useCallback(() => {
    const editorEl = popoverRef.current?.querySelector<HTMLElement>('.rich-text-editor');
    if (editorEl && document.activeElement === editorEl) {
      editorEl.blur();
    }
    onClose();
  }, [onClose]);

  // Close on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  return createPortal(
    <>
      <div className="key-features-popover-backdrop" onMouseDown={handleClose} />
      <div
        ref={popoverRef}
        className="key-features-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — ${projectName}`}
        // Initial visibility:hidden so we never flash at 0,0; the layout
        // effect sets visibility:visible once it's positioned.
        style={{ visibility: 'hidden' }}
        // Stop backdrop dismissal when interacting with the card itself.
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="key-features-popover-header" onPointerDown={handleHeaderPointerDown}>
          <div className="key-features-popover-title">
            <span className="key-features-popover-eyebrow">{title}</span>
            <span className="key-features-popover-project">{projectName || 'Untitled project'}</span>
          </div>
          <button
            type="button"
            className="key-features-popover-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="key-features-popover-body">
          <RichTextEditor
            value={value}
            onSave={onSave}
            className="key-features-popover-editor"
            dockedToolbar
          />
        </div>
        <div className="key-features-popover-footer">
          <span>Auto-saves on close</span>
          <span><kbd>Esc</kbd> to close</span>
        </div>
        <div
          className="key-features-popover-resize"
          onPointerDown={handleResizePointerDown}
          aria-hidden="true"
        />
      </div>
    </>,
    document.body,
  );
}
