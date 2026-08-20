/**
 * Drag offset probe — paste into the browser console, then drag a phase bar.
 *
 * Reports, per pointermove: where the cursor is, where the bar's grabbed point
 * actually ended up, and the gap between them. A constant non-zero gap from the
 * first sample means the bar is positioned rather than translated; a gap that
 * grows with distance means a scale mismatch between screen pixels and the
 * coordinate space the bar is drawn in.
 *
 * Prints a table on pointerup. Delete this file once the cause is found.
 */
(() => {
  const store = window.__ganttStore;
  if (!store) return console.warn('[drag-probe] gantt store not exposed — run in dev.');

  let grab = null;
  const samples = [];

  const barRect = () => [...document.querySelectorAll('svg rect')]
    .filter(r => +r.getAttribute('height') === 36)
    .map(r => ({ el: r, box: r.getBoundingClientRect() }));

  addEventListener('pointerdown', e => {
    const hit = barRect().find(({ box }) =>
      e.clientX >= box.left && e.clientX <= box.right &&
      e.clientY >= box.top && e.clientY <= box.bottom);
    if (!hit) return;
    grab = {
      cursorX: e.clientX,
      barLeft: hit.box.left,
      // How far into the bar you grabbed. This offset must stay constant.
      offsetIntoBar: e.clientX - hit.box.left,
      el: hit.el,
    };
    samples.length = 0;
    console.log('[drag-probe] grabbed %.1fpx into the bar', grab.offsetIntoBar);
  }, true);

  addEventListener('pointermove', e => {
    if (!grab) return;
    const box = grab.el.getBoundingClientRect();
    // Where the grabbed point of the bar now sits on screen.
    const grabbedPointNow = box.left + grab.offsetIntoBar;
    samples.push({
      cursorMoved: +(e.clientX - grab.cursorX).toFixed(1),
      barMoved: +(box.left - grab.barLeft).toFixed(1),
      gapCursorToGrabPoint: +(e.clientX - grabbedPointNow).toFixed(1),
    });
  }, true);

  addEventListener('pointerup', () => {
    if (!grab || !samples.length) { grab = null; return; }
    console.table(samples.filter((_, i) => i % 3 === 0).slice(0, 12));
    const gaps = samples.map(s => s.gapCursorToGrabPoint);
    const first = gaps[0], last = gaps[gaps.length - 1];
    const spread = Math.max(...gaps) - Math.min(...gaps);
    console.log(
      '[drag-probe] gap first=%.1f last=%.1f spread=%.1f → %s',
      first, last, spread,
      spread < 3 && Math.abs(first) > 3 ? 'CONSTANT OFFSET (positioned, not translated)'
        : spread >= 3 ? 'GROWING OFFSET (scale mismatch)'
        : 'tracking correctly (gap within snap tolerance)',
    );
    grab = null;
  }, true);

  console.log('[drag-probe] armed — drag a phase bar.');
})();
