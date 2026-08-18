/**
 * BBD v2 type scale — the single source of truth for the SVG canvas.
 *
 * The DOM gets these as CSS custom properties in App.css; the canvas can't
 * read those, so it imports these constants instead of repeating the font
 * stack as a string literal in every <text> (which is how the two surfaces
 * drifted apart in the first place).
 *
 * Scale (design-system/foundations/typography.html):
 *   15 Montserrat 700  app title / launcher heading
 *   14 Montserrat 600  panel detail name
 *   13 Open Sans  600  row titles, buttons, plan names
 *   12 Open Sans  400  body — panels, menus, inputs
 *   11 Open Sans  400  secondary — meta, hints, attribution
 *   10 Montserrat 700  section labels / eyebrows (caps +0.12em), on-bar labels
 *    9            700  badges, pills, chip initials — FLOOR, never smaller
 */

export const FONT_DISPLAY = "'Montserrat', 'Open Sans', Helvetica, Arial, sans-serif";
export const FONT_BODY = "'Open Sans', Helvetica, Arial, sans-serif";

/** Every size the canvas may use. Nothing below 9. */
export const FS = {
  title: 15,
  detail: 14,
  row: 13,
  body: 12,
  meta: 11,
  label: 10,
  badge: 9,
} as const;

/** Weights the scale pairs with each step. */
export const FW = {
  display: 700,
  detailName: 600,
  row: 600,
  body: 400,
  meta: 400,
  label: 700,
  badge: 700,
} as const;

/** Brand tracking — eyebrows and kickers only; everything else stays dense. */
export const EYEBROW_TRACKING = 0.12;
