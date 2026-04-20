import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeHtml } from '../utils/htmlSanitize';

interface Props {
  value: string;
  onSave: (html: string) => void;
  className?: string;
}

interface ToolbarPos {
  x: number;
  y: number;
}

// Must match the ALLOWED_FONT_SIZES set in src/utils/htmlSanitize.ts
const SIZE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Small', value: '0.85em' },
  { label: 'Normal', value: '1em' },
  { label: 'Large', value: '1.2em' },
];

/** Unwrap every <span> with inline font-size inside `root`. */
function unwrapFontSizeSpans(root: DocumentFragment | Element): void {
  root.querySelectorAll<HTMLElement>('span[style*="font-size"]').forEach(span => {
    const p = span.parentNode;
    if (!p) return;
    while (span.firstChild) p.insertBefore(span.firstChild, span);
    p.removeChild(span);
  });
}

/** Split `span` at a collapsed Range position inside it. Positions the
 *  range between the two resulting clones. */
function splitSpanAtRange(span: HTMLElement, range: Range): void {
  const parent = span.parentNode;
  if (!parent) return;

  const beforeR = document.createRange();
  beforeR.setStart(span, 0);
  beforeR.setEnd(range.startContainer, range.startOffset);
  const beforeFrag = beforeR.extractContents();

  const afterR = document.createRange();
  afterR.setStart(range.startContainer, range.startOffset);
  afterR.setEnd(span, span.childNodes.length);
  const afterFrag = afterR.extractContents();

  if (beforeFrag.childNodes.length > 0) {
    const clone = span.cloneNode(false) as HTMLElement;
    clone.appendChild(beforeFrag);
    parent.insertBefore(clone, span);
  }
  if (afterFrag.childNodes.length > 0) {
    const clone = span.cloneNode(false) as HTMLElement;
    clone.appendChild(afterFrag);
    parent.insertBefore(clone, span.nextSibling);
  }

  range.setStartBefore(span);
  range.setEndBefore(span);
  parent.removeChild(span);
}

/**
 * Rich-text editor using contentEditable + document.execCommand.
 *
 * React 19 does not reconcile contentEditable children, so we set
 * `innerHTML` only once on mount and read it only on blur — mirroring
 * the existing `defaultValue` / `onBlur` pattern used for textareas.
 *
 * Callers should pass `key={lane.id}` so swapping swimlanes remounts
 * the editor and resets the DOM from `value`.
 */
export default function RichTextEditor({ value, onSave, className }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<ToolbarPos | null>(null);
  const [showSizeMenu, setShowSizeMenu] = useState(false);

  // Sync the editor's content from the `value` prop. Runs on mount and
  // whenever `value` changes from an external source (import, undo,
  // reset) — but skips when the editor is focused, because the user is
  // actively typing and we don't want to clobber their caret.
  //
  // Legacy fields (projectName, keyDependencies) may be plain text
  // containing `<` or `&` — treat values without HTML tags as text so
  // they don't get misparsed. Values with tags run through the sanitizer.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const v = value || '';
    if (/<[a-z/][^>]*>/i.test(v)) {
      el.innerHTML = sanitizeHtml(v);
    } else {
      el.textContent = v;
    }
  }, [value]);

  // Clamp toolbar to viewport after it renders.
  useEffect(() => {
    if (!toolbar || !toolbarRef.current) return;
    const rect = toolbarRef.current.getBoundingClientRect();
    const clampedX = Math.min(toolbar.x, window.innerWidth - rect.width - 4);
    const clampedY = Math.min(toolbar.y, window.innerHeight - rect.height - 4);
    if (clampedX !== toolbar.x || clampedY !== toolbar.y) {
      setToolbar({ x: clampedX, y: clampedY });
    }
  }, [toolbar]);

  // Dismiss toolbar on outside mousedown (clicks inside editor or toolbar are ignored).
  useEffect(() => {
    if (!toolbar) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolbarRef.current?.contains(target)) return;
      if (editorRef.current?.contains(target)) return;
      setToolbar(null);
      setShowSizeMenu(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handle);
    };
  }, [toolbar]);

  const handleContextMenu = (e: React.MouseEvent) => {
    // Prevent the browser menu AND the swimlane-row context menu above us.
    e.preventDefault();
    e.stopPropagation();
    setToolbar({ x: e.clientX, y: e.clientY });
    setShowSizeMenu(false);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // If focus moved to a toolbar button, don't save yet — the button
    // will re-focus the editor and we'll get another blur later.
    const related = e.relatedTarget as Node | null;
    if (related && toolbarRef.current?.contains(related)) return;
    if (editorRef.current) {
      onSave(sanitizeHtml(editorRef.current.innerHTML));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const content = html
      ? sanitizeHtml(html)
      : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    document.execCommand('insertHTML', false, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Inside list items, let the browser split <li> naturally. Outside
    // lists, Chrome wraps each Enter in <div>, which the sanitizer would
    // unwrap and silently drop the newline — force <br> instead.
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      let inList = false;
      if (sel?.anchorNode) {
        let node: Node | null = sel.anchorNode;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'LI') {
            inList = true;
            break;
          }
          node = node.parentNode;
        }
      }
      if (!inList) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    }
  };

  const exec = (command: string) => {
    document.execCommand(command);
    editorRef.current?.focus();
  };

  const applySize = (size: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    if (!editor.contains(range.commonAncestorContainer)) return;

    // Extract the selection so we can clean it before re-inserting.
    const fragment = range.extractContents();

    // Unwrap any font-size spans already inside the selection — otherwise
    // the new size would nest and multiply (em is relative).
    unwrapFontSizeSpans(fragment);

    // Walk up from the insertion point and split any ancestor font-size
    // span so the insertion point becomes a sibling rather than a
    // descendant. Without this, `font-size: 1em` inside an ancestor
    // `font-size: 1.2em` still renders at 1.2× base — i.e. Normal would
    // silently inherit the ancestor's size.
    let anc: Node | null = range.startContainer.parentNode;
    while (anc && anc !== editor) {
      const nextAnc = anc.parentNode;
      if (anc.nodeType === Node.ELEMENT_NODE) {
        const el = anc as HTMLElement;
        if (el.tagName === 'SPAN' && el.style.fontSize) {
          splitSpanAtRange(el, range);
        }
      }
      anc = nextAnc;
    }

    // Insert. Normal uses no wrapper — content inherits the field's base
    // size naturally; Small/Large wrap in a new size span.
    const inserted: Node[] = [];
    if (size === '1em') {
      inserted.push(...Array.from(fragment.childNodes));
      range.insertNode(fragment);
    } else {
      const span = document.createElement('span');
      span.style.fontSize = size;
      span.appendChild(fragment);
      inserted.push(span);
      range.insertNode(span);
    }

    // Restore a selection over the inserted content so further clicks
    // operate on the same text.
    if (inserted.length > 0 && inserted[0].parentNode) {
      const r = document.createRange();
      r.setStartBefore(inserted[0]);
      r.setEndAfter(inserted[inserted.length - 1]);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    // Ancestor splits can leave empty font-size spans; drop them.
    editor.querySelectorAll<HTMLElement>('span[style*="font-size"]').forEach(el => {
      if (!el.firstChild) el.remove();
    });

    setShowSizeMenu(false);
    editor.focus();
  };

  // Prevent the toolbar button from stealing focus before its onClick fires.
  const btnMouseDown = (e: React.MouseEvent) => e.preventDefault();

  return (
    <>
      <div
        ref={editorRef}
        className={`rich-text-editor ${className || ''}`}
        contentEditable="true"
        suppressContentEditableWarning
        tabIndex={0}
        onContextMenu={handleContextMenu}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
      />
      {toolbar && createPortal(
        <div
          ref={toolbarRef}
          className="formatting-toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          onContextMenu={e => e.preventDefault()}
        >
          <button type="button" onMouseDown={btnMouseDown} onClick={() => exec('bold')} title="Bold">
            <b>B</b>
          </button>
          <button type="button" onMouseDown={btnMouseDown} onClick={() => exec('italic')} title="Italic">
            <i>I</i>
          </button>
          <button type="button" onMouseDown={btnMouseDown} onClick={() => exec('underline')} title="Underline">
            <u>U</u>
          </button>
          <span className="formatting-toolbar-divider" />
          <button type="button" onMouseDown={btnMouseDown} onClick={() => exec('insertUnorderedList')} title="Bullet list">
            &#x2022; List
          </button>
          <button type="button" onMouseDown={btnMouseDown} onClick={() => exec('insertOrderedList')} title="Numbered list">
            1. List
          </button>
          <span className="formatting-toolbar-divider" />
          <div className="formatting-size-wrapper">
            <button
              type="button"
              onMouseDown={btnMouseDown}
              onClick={() => setShowSizeMenu(m => !m)}
              title="Font size"
            >
              Size &#x25BE;
            </button>
            {showSizeMenu && (
              <div className="formatting-size-menu">
                {SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={btnMouseDown}
                    onClick={() => applySize(opt.value)}
                  >
                    <span style={{ fontSize: opt.value }}>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
