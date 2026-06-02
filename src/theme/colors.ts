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
  BG_APP: '#0B1426', // Midnight Express
  BG_HEADER: '#0D203C', // Dark Navy — toolbar / sticky headers
  BG_SURFACE: '#102A4A', // cards / menus / popovers / inputs / panels
  BG_SURFACE_2: '#16335A', // elevated / hover / list rows
  ROW_EVEN: '#0E2543',
  ROW_ODD: '#0B1F3A',
  MONTH_BAND: '#102A4A',
  SECTION_BAND: '#16335A',

  TEXT_PRIMARY: '#EEEEEE', // Subtle White
  TEXT_HEADER: '#EEEEEE',
  TEXT_SECONDARY: '#8AA0B8',
  WEEK_LABEL_COLOR: '#7E97B3',

  GRID_WEEKLY: 'rgba(255, 255, 255, 0.06)',
  GRID_MONTHLY: 'rgba(255, 255, 255, 0.12)',
  BORDER: 'rgba(255, 255, 255, 0.10)',
  HEADER_DIVIDER: 'rgba(255, 255, 255, 0.15)',

  MONTH_SHADE: 'rgba(255, 255, 255, 0.03)',
  WEEKEND_SHADE: 'rgba(255, 255, 255, 0.04)',
  HIGHLIGHT_MONTH: '#F5A42A',

  TODAY_LINE: '#FF8A3D',
  TODAY_STRIP: 'rgba(255, 138, 61, 0.14)',

  MILESTONE_FILL: '#31BF69',
  MILESTONE_STROKE: '#A6E9C4',
  MILESTONE_TEXT: '#0B1426',

  SELECTION_STROKE: '#EEEEEE',
  BAR_SHADOW: 'rgba(0, 0, 0, 0.45)',
  BAR_HANDLE_FILL: '#FFFFFF',
  BAR_HANDLE_STROKE: '#0B1426',

  HOLIDAY_MARK: '#E0556B',

  ACCENT_PRIMARY: '#31BF69', // DHA Green
  ACCENT_SECONDARY: '#0098CC', // Morpho Blue
  SUCCESS: '#009991', // Deep Cyan
  WARNING: '#CB6600', // Dark Washed Orange
  ERROR: '#99001B', // Crimson
  ON_ACCENT: '#07140B', // text/icon on a primary (green) surface
};

const light: ThemeColors = {
  BG_APP: '#E8E4DD',
  BG_HEADER: '#FFFFFF', // light toolbar / sticky headers (DHA-light, like the live site nav)
  BG_SURFACE: '#FFFAF3', // cards / menus / popovers / inputs / panels
  BG_SURFACE_2: '#F5F2EC',
  ROW_EVEN: '#FAF9F6',
  ROW_ODD: '#F5F2EC',
  MONTH_BAND: '#E2DED6',
  SECTION_BAND: '#E2DED6',

  TEXT_PRIMARY: '#1A1814',
  TEXT_HEADER: '#0D203C', // dark navy text on the light header
  TEXT_SECONDARY: '#5C5A54',
  WEEK_LABEL_COLOR: '#888078',

  GRID_WEEKLY: '#DEDAD3',
  GRID_MONTHLY: '#C8C3BA',
  BORDER: '#DEDAD3',
  HEADER_DIVIDER: '#C8C3BA',

  MONTH_SHADE: 'rgba(0, 0, 0, 0.045)',
  WEEKEND_SHADE: 'rgba(46, 125, 50, 0.10)',
  HIGHLIGHT_MONTH: '#F5A42A',

  TODAY_LINE: '#AD4E0A',
  TODAY_STRIP: 'rgba(253, 232, 213, 0.40)',

  MILESTONE_FILL: '#D5E8D4',
  MILESTONE_STROKE: '#82B366',
  MILESTONE_TEXT: '#2D4C1C',

  SELECTION_STROKE: '#333333',
  BAR_SHADOW: 'rgba(0, 0, 0, 0.30)',
  BAR_HANDLE_FILL: '#FFFFFF',
  BAR_HANDLE_STROKE: '#7A7264',

  HOLIDAY_MARK: '#CC4444',

  ACCENT_PRIMARY: '#2A9D54', // DHA Green tuned for white text on light
  ACCENT_SECONDARY: '#0277A3', // Morpho Blue tuned for light
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

/** Read the active theme without React (for use in the Zustand store). */
export function getActiveThemeName(): ThemeName {
  try {
    const v = localStorage.getItem('dha-theme');
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}
