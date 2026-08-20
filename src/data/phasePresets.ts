import type { PhaseType, PhaseColorScheme, PhaseTypeDef } from '../types/gantt';
import { getActiveThemeName, type ThemeName } from '../theme/colors';

type PresetMap = Record<string, PhaseColorScheme>;

/**
 * Default phase-type colours — a categorical palette chosen so adjacent
 * phases stay distinguishable on both themes (users can recolour any type):
 *   analysis → steel blue · concept → indigo · development → amber
 *   sit → teal · uat → green · live → crimson · custom → slate
 *
 * Chroma is deliberately mid-range rather than fluorescent: solid bars cover
 * a lot of a plan, and at full saturation they vibrate against each other and
 * against the tinted swimlane rows, flattening the hierarchy. These read as
 * distinct hues while letting the timeline shape lead. Every fill is dark
 * enough for white label text in BOTH themes, so legibility no longer varies
 * per phase (uat and custom used dark ink before). Analysis and concept were
 * the same cyan and are now separate hues.
 *
 * In the tagged-bar render, `fill` is the **tag colour** (the small coloured
 * left-edge stripe and the body colour for the short-bar fallback). `text` is
 * used only by the short-bar pill — tagged bars use the theme's TEXT_PRIMARY.
 * On the dark canvas, Crimson is brightened (#D23A52) for legibility; on light
 * it uses the exact #99001B.
 */
const DARK_PRESETS: PresetMap = {
  analysis: { fill: '#3a7d99', stroke: '#24505f', text: '#ffffff', label: 'ANALYSIS & DESIGN' },
  development: { fill: '#a3651b', stroke: '#6b420f', text: '#ffffff', label: 'DEVELOPMENT' },
  sit: { fill: '#2a7c73', stroke: '#1a4f49', text: '#ffffff', label: 'SIT' },
  uat: { fill: '#3f854c', stroke: '#285531', text: '#ffffff', label: 'UAT' },
  live: { fill: '#b2455a', stroke: '#742c3a', text: '#ffffff', label: 'LIVE' },
  concept: { fill: '#5f5fa8', stroke: '#3d3d6e', text: '#ffffff', label: 'CONCEPTUALISATION' },
  custom: { fill: '#6b7379', stroke: '#454b4f', text: '#ffffff', label: 'CUSTOM' },
};

const LIGHT_PRESETS: PresetMap = {
  analysis: { fill: '#33708a', stroke: '#22495a', text: '#ffffff', label: 'ANALYSIS & DESIGN' },
  development: { fill: '#a1631c', stroke: '#6a4112', text: '#ffffff', label: 'DEVELOPMENT' },
  sit: { fill: '#2a7c73', stroke: '#1b504a', text: '#ffffff', label: 'SIT' },
  uat: { fill: '#3f854c', stroke: '#295631', text: '#ffffff', label: 'UAT' },
  live: { fill: '#9e3d51', stroke: '#672835', text: '#ffffff', label: 'LIVE' },
  concept: { fill: '#55549b', stroke: '#383764', text: '#ffffff', label: 'CONCEPTUALISATION' },
  custom: { fill: '#5d656b', stroke: '#3d4245', text: '#ffffff', label: 'CUSTOM' },
};

const PRESETS_BY_THEME: Record<ThemeName, PresetMap> = {
  dark: DARK_PRESETS,
  light: LIGHT_PRESETS,
};

/**
 * Every fill that a built-in phase type has shipped with (legacy pastels, an
 * intermediate vivid set, and the current per-theme design fills). A built-in
 * type whose stored fill is in this set is treated as "theme-managed" and gets
 * refreshed to the active theme; a fill outside it means the user picked their
 * own colour, which we never override.
 */
const KNOWN_BUILTIN_FILLS: Record<string, Set<string>> = {
  analysis: new Set(['#f5e6a3', '#f5c84b', '#0098cc', '#00b8cc', '#3e7e99', '#cfe6f1', '#3a7d99', '#33708a']),
  development: new Set(['#fcdea4', '#f2914a', '#cb6600', '#bd7a40', '#f1ddc4', '#b3701f', '#a1631c', '#a3651b']),
  sit: new Set(['#c6e9c6', '#5fd98a', '#009991', '#3e867f', '#cfe7e4', '#2f8a80', '#2a7c73']),
  uat: new Set(['#beddfa', '#56c2e8', '#31bf69', '#4e9168', '#d6efdf', '#4a9455', '#3f854c']),
  live: new Set(['#f8baba', '#e8657a', '#d23a52', '#99001b', '#a85563', '#f1d4d9', '#b2455a', '#9e3d51']),
  concept: new Set(['#f5e6a3', '#4fd3c9', '#0098cc', '#00b8cc', '#3e7e99', '#cfe6f1', '#5f5fa8', '#55549b']),
  custom: new Set(['#e0e0e0', '#b8c4d4', '#8aa0b8', '#8a9298', '#c2ccd6', '#6e7e92', '#dde3ea', '#6b7379', '#5d656b']),
};

/** Phase colour presets for a theme (defaults to the active theme). */
export function getPhasePresets(theme: ThemeName = getActiveThemeName()): PresetMap {
  return PRESETS_BY_THEME[theme];
}

/**
 * Legacy export retained for code that hasn't migrated. Resolves to the active
 * theme's presets at module-load time. Prefer getPhasePresets()/getPhaseDef().
 */
export const PHASE_PRESETS: PresetMap = getPhasePresets();

export const PHASE_TYPE_OPTIONS: { value: PhaseType; label: string }[] = [
  { value: 'analysis', label: 'Analysis & Design' },
  { value: 'development', label: 'Development' },
  { value: 'sit', label: 'SIT' },
  { value: 'uat', label: 'UAT' },
  { value: 'live', label: 'Live' },
  { value: 'concept', label: 'Conceptualisation' },
  { value: 'custom', label: 'Custom' },
];

export const FALLBACK_PHASE_DEF: PhaseTypeDef = {
  id: '__missing__',
  name: 'Missing',
  label: 'MISSING',
  fill: '#8a9298',
  stroke: '#4a5057',
  text: '#07140b',
  order: 999,
};

/**
 * Built-in phase types for a theme. Stable ids match the legacy `PhaseType`
 * union, so existing bars keep resolving. Used to seed new documents and to
 * "Reset to defaults" against the active theme.
 */
export function getBuiltinPhaseTypes(theme: ThemeName = getActiveThemeName()): PhaseTypeDef[] {
  const presets = getPhasePresets(theme);
  return PHASE_TYPE_OPTIONS.map((opt, i) => ({
    id: opt.value,
    name: opt.label,
    label: presets[opt.value].label,
    fill: presets[opt.value].fill,
    stroke: presets[opt.value].stroke,
    text: presets[opt.value].text,
    order: i,
  }));
}

/**
 * Refresh the colours of theme-managed built-in phase types to the given theme,
 * preserving each type's name/label/order. Custom types and built-ins the user
 * has recoloured (fill not in KNOWN_BUILTIN_FILLS) are returned unchanged.
 */
export function applyThemePresetsToBuiltins(
  types: PhaseTypeDef[],
  theme: ThemeName = getActiveThemeName(),
): PhaseTypeDef[] {
  const presets = getPhasePresets(theme);
  return types.map(t => {
    const known = KNOWN_BUILTIN_FILLS[t.id];
    const preset = presets[t.id];
    if (known && preset && known.has((t.fill || '').toLowerCase())) {
      return { ...t, fill: preset.fill, stroke: preset.stroke, text: preset.text };
    }
    return t;
  });
}

/** Find a phase type definition by id; returns FALLBACK_PHASE_DEF if missing. */
export function getPhaseDef(id: PhaseType, types: PhaseTypeDef[]): PhaseTypeDef {
  const found = types.find(t => t.id === id);
  if (found) return found;
  // Fall back to the active theme's preset for any built-in id.
  const preset = getPhasePresets()[id];
  if (preset) {
    return {
      id,
      name: id,
      label: preset.label,
      fill: preset.fill,
      stroke: preset.stroke,
      text: preset.text,
      order: 999,
    };
  }
  return FALLBACK_PHASE_DEF;
}

/** WCAG relative luminance, or null if the hex is unparseable. */
function relativeLuminance(hex: string): number | null {
  const h = (hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * linear(parseInt(h.slice(0, 2), 16)) +
    0.7152 * linear(parseInt(h.slice(2, 4), 16)) +
    0.0722 * linear(parseInt(h.slice(4, 6), 16))
  );
}

const INK_LIGHT = '#ffffff';
/**
 * Deliberately pure black, not a softened near-black.
 *
 * The two inks have to straddle every possible fill: the worst fill is the one
 * where they tie, and that tie is the best contrast anything can get. Pure
 * black ties white at L ≈ 0.179 for 4.58:1, which clears AA. Softening the ink
 * to #141719 pushes the tie to L ≈ 0.198 and drops the guarantee to 4.24:1 —
 * so a mid-green like UAT's #3f854c becomes unreadable in *both* inks and no
 * amount of choosing between them helps. The softer ink is not worth an
 * unreachable floor.
 */
const INK_DARK = '#000000';

/**
 * Ink that stays legible on an arbitrary fill.
 *
 * Phase and environment colours are user-editable, and the built-in palette
 * has been through three generations, pastels included (see
 * KNOWN_BUILTIN_FILLS). A chip that hardcodes white text vanishes on the
 * pastels; one that hardcodes dark text vanishes on the current mid-tones. The
 * stored `text` field is no help either — it was derived under whichever
 * scheme was current when the type was made.
 *
 * Comparing the two candidates outright, rather than testing luminance against
 * a precomputed threshold, keeps this correct if either ink is ever changed. A
 * threshold silently encodes which inks it was derived for, which is exactly
 * how the first version of this shipped a 4.0:1 chip.
 */
export function readableInkOn(fill: string): string {
  const l = relativeLuminance(fill);
  if (l === null) return INK_LIGHT;
  const against = (ink: string) => {
    const li = relativeLuminance(ink) ?? 0;
    return (Math.max(l, li) + 0.05) / (Math.min(l, li) + 0.05);
  };
  return against(INK_DARK) >= against(INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

/** Derive stroke and text colors from a base fill — used when the user
 * picks a single color and we want sensible defaults for the others. */
export function deriveColorScheme(baseFill: string): { fill: string; stroke: string; text: string } {
  const hex = baseFill.replace('#', '');
  if (hex.length !== 6) return { fill: baseFill, stroke: '#444', text: '#222' };
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const darken = (c: number, factor: number) => Math.max(0, Math.round(c * factor));
  const stroke = `#${[darken(r, 0.55), darken(g, 0.55), darken(b, 0.55)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
  const text = `#${[darken(r, 0.3), darken(g, 0.3), darken(b, 0.3)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
  return { fill: baseFill, stroke, text };
}
