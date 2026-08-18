/**
 * Real text measurement for the SVG canvas.
 *
 * Bar labels used to be sized with per-character estimates (9px dates at
 * 5.2px/char, 10px Montserrat caps at 6.8px/char). Those are wrong in both
 * directions — measured against the real font, "15 Jul" is 26px not 31px, and
 * DEVELOPMENT runs 7.44px/char while TESTING runs 6.53 — so labels truncated
 * early on narrow words, overflowed on wide ones, and started at a different
 * offset on every bar depending on how wide that bar's date happened to be.
 *
 * A 2D canvas measures the same font the SVG renders, synchronously and
 * without touching the DOM. Results are memoised because the timeline
 * re-measures every visible bar on each render.
 */

import { DAY_MONTH_TOKENS } from './dateUtils';

const FONT_STACK = "'Montserrat', 'Open Sans', Helvetica, Arial, sans-serif";

let ctx: CanvasRenderingContext2D | null = null;
function context(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  return ctx;
}

const cache = new Map<string, number>();

/** Width in px of `text` at the given size/weight in the canvas font stack.
 * Falls back to a per-character estimate only if canvas is unavailable. */
export function measureText(text: string, fontSize: number, fontWeight: number): number {
  if (!text) return 0;
  const key = `${fontSize}|${fontWeight}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const c = context();
  let width: number;
  if (c) {
    c.font = `${fontWeight} ${fontSize}px ${FONT_STACK}`;
    width = c.measureText(text).width;
  } else {
    width = text.length * fontSize * 0.68;
  }
  cache.set(key, width);
  return width;
}

/**
 * Longest prefix of `text` that fits `maxWidth`, with an ellipsis when it had
 * to cut. Returns '' when not even one character plus the ellipsis fits, so
 * the caller can drop the label entirely rather than render a bare "…".
 */
export function fitText(text: string, maxWidth: number, fontSize: number, fontWeight: number): string {
  if (!text || maxWidth <= 0) return '';
  if (measureText(text, fontSize, fontWeight) <= maxWidth) return text;

  const ellipsis = '…';
  const ellipsisW = measureText(ellipsis, fontSize, fontWeight);
  if (ellipsisW > maxWidth) return '';

  // Binary search the cut point — the timeline can hold hundreds of bars, so
  // this stays O(log n) per label rather than walking character by character.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid), fontSize, fontWeight) + ellipsisW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ellipsis : '';
}

/** Width reserved for a bar's start-date so every label on the chart begins
 * at the same offset instead of jittering with the date's own width.
 *
 * Measured across every date `formatDayMonth` can actually produce rather
 * than assuming one. The previous '30 Sep' stand-in under-reserved: "Aug" is
 * wider than "Sep" in Montserrat, so an August bar's date ran to the very
 * edge of its slot and crowded whatever followed it. */
export function dateSlotWidth(fontSize: number, fontWeight: number): number {
  const key = `slot|${fontSize}|${fontWeight}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const digits = '0123456789'.split('');
  const widestDigit = digits.reduce((a, d) =>
    measureText(d, fontSize, fontWeight) > measureText(a, fontSize, fontWeight) ? d : a, '0');
  const widestDay = widestDigit + widestDigit;
  const width = DAY_MONTH_TOKENS.reduce(
    (max, mon) => Math.max(max, measureText(`${widestDay} ${mon}`, fontSize, fontWeight)),
    0,
  );
  cache.set(key, width);
  return width;
}
