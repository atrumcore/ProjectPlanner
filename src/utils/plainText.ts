/**
 * Flatten a rich-text HTML string into a single readable plain-text line.
 * Structural breaks — <br> and the boundaries of <li>/<p>/<div> — become the
 * given separator (a space by default), so a multi-line title or a bullet list
 * collapses cleanly instead of leaking raw tags or running words together.
 *
 * Swimlane.projectName and keyFeatures are stored as contentEditable HTML, so
 * anywhere they're shown as plain text — dropdown options, tags, the notes
 * email, the CSV export — should pass through here.
 */
export function htmlToPlainText(html: string, separator = ' '): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  root.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  root.querySelectorAll('li, p, div').forEach(el => el.append('\n'));

  return (root.textContent ?? '')
    .split('\n')
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(separator);
}
