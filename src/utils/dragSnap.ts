/**
 * Pointer-delta → timeline-position maths for bar drags.
 *
 * Extracted from PhaseBar so the snap grid is one testable expression rather
 * than three copies inline in a pointer handler. A drag that does not track
 * the cursor is hard to diagnose by reading — this makes the step size
 * assertable without a browser.
 */

/** One calendar day, in weeks. The timeline's finest position. */
export const DAY_IN_WEEKS = 1 / 7;

/**
 * Convert a horizontal pointer delta into a week delta snapped to whole days.
 *
 * Snapping to days rather than to a coarser grid is what keeps the bar under
 * the cursor: at the default 36px week a day is 5.1px, so the grabbed point
 * can never sit more than ~2.6px from the pointer. A half-week grid would be
 * 18px and put it up to 9px adrift, which reads as the bar refusing to follow.
 */
export function weekDeltaFromPixels(deltaPx: number, weekWidthPx: number): number {
  if (!Number.isFinite(weekWidthPx) || weekWidthPx <= 0) return 0;
  const dayPx = weekWidthPx / 7;
  return Math.round(deltaPx / dayPx) * DAY_IN_WEEKS;
}

/**
 * Round a week position onto the day grid.
 *
 * A drag applies a whole number of days to wherever the bar already sat, so a
 * bar that started life off-grid stays off-grid for ever — every later
 * position inherits the original fraction. Normalising the committed position
 * means a bar lands on a real calendar day no matter how it was created
 * (imported, AI-generated, quick-added, or dragged before this existed).
 */
export function snapWeekToDay(week: number): number {
  if (!Number.isFinite(week)) return 0;
  return Math.round(week * 7) * DAY_IN_WEEKS;
}
