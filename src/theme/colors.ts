/**
 * Theme registry — single source of truth for colours consumed by JS/SVG
 * components (which can't read CSS variables at render time).
 *
 * IMPORTANT: these values are mirrored as CSS custom properties in
 * `src/App.css` (under `:root, [data-theme='dark']` and `[data-theme='light']`).
 * If you change a value here, update the matching `--var` there too — the SVG
 * canvas (colors.ts) and the CSS chrome must stay visually in sync.
 *
 * To add a new theme: add an entry to `themes` with the same keys and a matching
 * `[data-theme='<name>']` block in App.css, then extend `ThemeName`.
 */

/** BBD brand red (logo mark). Reserved for brand moments only — never for
 *  interactive state, since red already signals conflict/danger here. */
export const BRAND_ACCENT = '#CE181E';

export type ThemeName = 'dark' | 'light';

export const DEFAULT_THEME: ThemeName = 'dark';

export interface ThemeColors {
  /* Surfaces */
  BG_APP: string;
  BG_HEADER: string;
  BG_SURFACE: string;
  BG_SURFACE_2: string;
  ROW_EVEN: string;
  ROW_ODD: string;
  MONTH_BAND: string;
  SECTION_BAND: string;
  /* Text */
  TEXT_PRIMARY: string;
  TEXT_HEADER: string;
  TEXT_SECONDARY: string;
  WEEK_LABEL_COLOR: string;
  /* Lines / borders */
  GRID_WEEKLY: string;
  GRID_MONTHLY: string;
  BORDER: string;
  HEADER_DIVIDER: string;
  /* Timeline shading */
  MONTH_SHADE: string;
  WEEKEND_SHADE: string;
  HIGHLIGHT_MONTH: string;
  /* Today marker */
  TODAY_LINE: string;
  TODAY_STRIP: string;
  /* Milestones */
  MILESTONE_FILL: string;
  MILESTONE_STROKE: string;
  MILESTONE_TEXT: string;
  /* Phase bars (selection + handles) */
  SELECTION_STROKE: string;
  BAR_SHADOW: string;
  BAR_HANDLE_FILL: string;
  BAR_HANDLE_STROKE: string;
  /* Misc markers */
  HOLIDAY_MARK: string;
  /* Accents */
  ACCENT_PRIMARY: string;
  ACCENT_SECONDARY: string;
  SUCCESS: string;
  WARNING: string;
  ERROR: string;
  ON_ACCENT: string;
}

const dark: ThemeColors = {
  BG_APP: '#0B0C0E', // near-black canvas (BBD v2)
  BG_HEADER: '#151719', // BBD Process Black — toolbar / sticky headers
  BG_SURFACE: '#17191C', // cards / menus / popovers / inputs / panels
  BG_SURFACE_2: '#212429', // elevated / hover / list rows
  ROW_EVEN: '#131518',
  ROW_ODD: '#101214',
  MONTH_BAND: '#17191C',
  SECTION_BAND: '#212429',

  TEXT_PRIMARY: '#EEEEEE', // Subtle White
  TEXT_HEADER: '#EEEEEE',
  TEXT_SECONDARY: '#8A9298', // BBD Cool Grey 5C
  WEEK_LABEL_COLOR: '#7E858C',

  GRID_WEEKLY: 'rgba(255, 255, 255, 0.06)',
  GRID_MONTHLY: 'rgba(255, 255, 255, 0.12)',
  BORDER: 'rgba(255, 255, 255, 0.10)',
  HEADER_DIVIDER: 'rgba(255, 255, 255, 0.15)',

  MONTH_SHADE: 'rgba(255, 255, 255, 0.03)',
  WEEKEND_SHADE: 'rgba(255, 255, 255, 0.04)',
  HIGHLIGHT_MONTH: '#F5A42A',

  TODAY_LINE: '#FFB224',
  TODAY_STRIP: 'rgba(255, 178, 36, 0.12)',

  MILESTONE_FILL: '#46A758',
  MILESTONE_STROKE: '#EAF6EC',
  MILESTONE_TEXT: '#0B0C0E',

  SELECTION_STROKE: '#EEEEEE',
  BAR_SHADOW: 'rgba(0, 0, 0, 0.45)',
  BAR_HANDLE_FILL: '#FFFFFF',
  BAR_HANDLE_STROKE: '#0B0C0E',

  HOLIDAY_MARK: '#D9363C',

  // BBD extension palette (violet + cyan).
  ACCENT_PRIMARY: '#4E44DB',
  ACCENT_SECONDARY: '#00B8CC', // interactive cyan (active panels/toggles)
  SUCCESS: '#009991',
  WARNING: '#CB6600',
  ERROR: '#99001B',
  ON_ACCENT: '#FFFFFF', // text/icon on a primary surface
};

const light: ThemeColors = {
  BG_APP: '#F6F6F7',
  BG_HEADER: '#FFFFFF', // light toolbar / sticky headers
  BG_SURFACE: '#FFFFFF', // cards / menus / popovers / inputs / panels
  BG_SURFACE_2: '#E9EAEB',
  ROW_EVEN: '#FAFAFA',
  ROW_ODD: '#F1F1F2',
  MONTH_BAND: '#E9EAEB',
  SECTION_BAND: '#E9EAEB',

  TEXT_PRIMARY: '#151719', // BBD Process Black
  TEXT_HEADER: '#151719',
  TEXT_SECONDARY: '#5A5F64',
  WEEK_LABEL_COLOR: '#8A9298',

  GRID_WEEKLY: '#E2E3E4',
  GRID_MONTHLY: '#C3C4C6',
  BORDER: '#DCDDDE',
  HEADER_DIVIDER: '#C3C4C6',

  MONTH_SHADE: 'rgba(0, 0, 0, 0.045)',
  WEEKEND_SHADE: 'rgba(0, 0, 0, 0.05)',
  HIGHLIGHT_MONTH: '#F5A42A',

  TODAY_LINE: '#A06700',
  TODAY_STRIP: 'rgba(255, 178, 36, 0.16)',

  MILESTONE_FILL: '#D5E8D4',
  MILESTONE_STROKE: '#82B366',
  MILESTONE_TEXT: '#2D4C1C',

  SELECTION_STROKE: '#333333',
  BAR_SHADOW: 'rgba(0, 0, 0, 0.30)',
  BAR_HANDLE_FILL: '#FFFFFF',
  BAR_HANDLE_STROKE: '#7A7264',

  HOLIDAY_MARK: '#B52222',

  ACCENT_PRIMARY: '#151719', // BBD black primary (v2 buttons card)
  ACCENT_SECONDARY: '#00929F', // cyan darkened for light-surface contrast
  SUCCESS: '#00897E',
  WARNING: '#CB6600',
  ERROR: '#99001B',
  ON_ACCENT: '#FFFFFF',
};

export const themes: Record<ThemeName, ThemeColors> = { dark, light };

/**
 * Lighten a user-picked colour so it stays visible against a dark navy canvas.
 * No-op on the light theme. Used for env markers (dots, marquees, contention
 * ribbons) so a dark-green or dark-navy environment colour doesn't disappear
 * into the background.
 */
export function brightenForDark(hex: string, theme: ThemeName): string {
  if (theme !== 'dark') return hex;
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return hex;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luma >= 0.45) return hex;
  const blend = luma < 0.15 ? 0.55 : luma < 0.30 ? 0.4 : 0.25;
  const mix = (c: number) => Math.round(c + (255 - c) * blend);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Convert a #rrggbb hex string to an `rgba(r, g, b, a)` string. Returns the
 * input unchanged if it isn't a 6-digit hex. Used to composite a translucent
 * swimlane tint over the themed row background. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Read the active theme without React (for use in the Zustand store). */
export function getActiveThemeName(): ThemeName {
  try {
    const v = localStorage.getItem('bbd-planner-theme');
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}
