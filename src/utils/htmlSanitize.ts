/**
 * Minimal HTML sanitizer for the rich-text editor.
 *
 * Allowlist:
 *   tags:  b, strong, i, em, u, ul, ol, li, span, br
 *   attrs: style on <span> — font-size only, limited to a small set of em-based presets
 *
 * Parses via DOMParser, walks the tree, drops everything not allowlisted
 * (preserving inner text), strips Word's mso-* / conditional / meta markup.
 */

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'SPAN', 'BR']);

// Only these font-size tokens survive on <span style>. Matches the editor's Size dropdown.
const ALLOWED_FONT_SIZES = new Set(['0.85em', '1em', '1.2em']);

function sanitizeStyleAttr(style: string): string {
  // Extract only font-size: <one of ALLOWED_FONT_SIZES>. Drop everything else (mso-*, colors, etc.).
  const match = style.match(/font-size\s*:\s*([^;]+)/i);
  if (!match) return '';
  const value = match[1].trim().toLowerCase();
  return ALLOWED_FONT_SIZES.has(value) ? `font-size: ${value}` : '';
}

function cleanNode(node: Node, out: Node[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.cloneNode(false));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  // Drop Word/Excel garbage entirely (including children).
  if (tag === 'META' || tag === 'STYLE' || tag === 'SCRIPT' || tag === 'O:P') return;

  if (ALLOWED_TAGS.has(tag)) {
    const clean = document.createElement(tag.toLowerCase());
    if (tag === 'SPAN') {
      const style = el.getAttribute('style');
      if (style) {
        const safe = sanitizeStyleAttr(style);
        if (safe) clean.setAttribute('style', safe);
      }
      // Drop empty spans — if no allowed style, unwrap children (handled by appending children below).
      if (!clean.getAttribute('style')) {
        // Unwrap: recurse children into `out` directly, skip the span.
        for (const child of Array.from(el.childNodes)) cleanNode(child, out);
        return;
      }
    }
    const inner: Node[] = [];
    for (const child of Array.from(el.childNodes)) cleanNode(child, inner);
    for (const child of inner) clean.appendChild(child);
    out.push(clean);
    return;
  }

  // Unknown/disallowed tag: unwrap — keep its text-bearing children.
  for (const child of Array.from(el.childNodes)) cleanNode(child, out);
}

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const out: Node[] = [];
  for (const child of Array.from(root.childNodes)) cleanNode(child, out);
  const wrapper = document.createElement('div');
  for (const node of out) wrapper.appendChild(node);
  return wrapper.innerHTML;
}

/** Escape plain text for safe insertion into HTML. */
function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Migrate legacy `keyFeatures: string[]` to an HTML bullet list.
 * Returns an empty string for empty arrays.
 */
export function featuresArrayToHtml(features: string[]): string {
  if (!features || features.length === 0) return '';
  return '<ul>' + features.map(f => `<li>${escapeText(f)}</li>`).join('') + '</ul>';
}
