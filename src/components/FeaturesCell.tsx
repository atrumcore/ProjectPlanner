import { useEffect, useRef, useState } from 'react';
import { sanitizeHtml } from '../utils/htmlSanitize';

interface Props {
  /** Sanitised HTML for the bullet list (matches the format the editor produces). */
  html: string;
  /** Receives the cell's bounding rect so the popover can anchor to it. */
  onClick: (rect: DOMRect) => void;
}

/**
 * Read-only display of a swimlane's Key Features. Renders the same HTML the
 * RichTextEditor produces, detects when content overflows the row height,
 * and exposes a click target that asks the parent to open the popover.
 */
export default function FeaturesCell({ html, onClick }: Props) {
  const cellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // Re-check overflow when the HTML changes, the row resizes, or fonts load.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  const handleClick = () => {
    const rect = cellRef.current?.getBoundingClientRect();
    if (rect) onClick(rect);
  };

  return (
    <div
      ref={cellRef}
      className={`swimlane-features${overflow ? ' has-overflow' : ''}`}
      style={{ flex: 1 }}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      title="Click to view all features"
    >
      <div
        ref={contentRef}
        className="swimlane-features-display"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
      <span className="swimlane-features-more" aria-hidden="true">more</span>
    </div>
  );
}
