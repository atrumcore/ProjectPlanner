import type { PhaseType, PhaseColorScheme, PhaseTypeDef } from '../types/gantt';
import { getActiveThemeName, type ThemeName } from '../theme/colors';

type PresetMap = Record<string, PhaseColorScheme>;

/**
 * Phase-type colours from the DHA design-system palette:
 *   analysis/concept → Morpho Blue  · development → Dark Washed Orange
 *   sit → Deep Cyan · uat → DHA Green · live → Crimson · custom → slate
 *
 * In the tagged-bar render, `fill` is the **tag colour** (the small coloured
 * left-edge stripe and the body colour for the short-bar fallback). `text` is
 * used only by the short-bar pill — tagged bars use the theme's TEXT_PRIMARY.
 * On the dark canvas, Crimson is brightened (#D23A52) for legibility; on light
 * it uses the exact #99001B.
 */
const DARK_PRESETS: PresetMap = {
  analysis: { fill: '#0098cc', stroke: '#006a90', text: '#ffffff', label: 'ANALYSIS & DESIGN' },
  development: { fill: '#cb6600', stroke: '#8a4500', text: '#ffffff', label: 'DEVELOPMENT' },
  sit: { fill: '#009991', stroke: '#00665f', text: '#ffffff', label: 'SIT' },
  uat: { fill: '#31bf69', stroke: '#1f8f4d', text: '#07261a', label: 'UAT' },
  live: { fill: '#d23a52', stroke: '#99001b', text: '#ffffff', label: 'LIVE' },
  concept: { fill: '#0098cc', stroke: '#006a90', text: '#ffffff', label: 'CONCEPTUALISATION' },
  custom: { fill: '#8aa0b8', stroke: '#4a5a72', text: '#07140b', label: 'CUSTOM' },
};

const LIGHT_PRESETS: PresetMap = {
  analysis: { fill: '#0098cc', stroke: '#006a90', text: '#ffffff', label: 'ANALYSIS & DESIGN' },
  development: { fill: '#cb6600', stroke: '#8a4500', text: '#ffffff', label: 'DEVELOPMENT' },
  sit: { fill: '#009991', stroke: '#00665f', text: '#ffffff', label: 'SIT' },
  uat: { fill: '#31bf69', stroke: '#1f8f4d', text: '#07261a', label: 'UAT' },
  live: { fill: '#99001b', stroke: '#5e0011', text: '#ffffff', label: 'LIVE' },
  concept: { fill: '#0098cc', stroke: '#006a90', text: '#ffffff', label: 'CONCEPTUALISATION' },
  custom: { fill: '#c2ccd6', stroke: '#6b7c92', text: '#1a1814', label: 'CUSTOM' },
};

const PRESETS_BY_THEME: Record<ThemeName, PresetMap> = {
  dark: DARK_PRESETS,
  light: LIGHT_PRESETS,
};

/**
 * "Legacy" solid-bar presets used when the user opts back into the old
 * full-coloured pill style (View → Appearance → Solid bars). Dark theme uses
 * the muted DHA tones we tried before tagged bars; light theme uses the
 * original pastel palette the app shipped with. Custom phase types keep their
 * stored colour in legacy mode (we only override built-in ids here).
 */
const LEGACY_DARK_PRESETS: PresetMap = {
  analysis: { fill: '#3e7e99', stroke: '#0098cc', text: '#ffffff', label: 'ANALYSIS & DESIGN' },
  development: { fill: '#bd7a40', stroke: '#cb6600', text: '#ffffff', label: 'DEVELOPMENT' },
  sit: { fill: '#3e867f', stroke: '#009991', text: '#ffffff', label: 'SIT' },
  uat: { fill: '#4e9168', stroke: '#31bf69', text: '#ffffff', label: 'UAT' },
  live: { fill: '#a85563', stroke: '#c0445a', text: '#ffffff', label: 'LIVE' },
  concept: { fill: '#3e7e99', stroke: '#0098cc', text: '#ffffff', label: 'CONCEPTUALISATION' },
  custom: { fill: '#6e7e92', stroke: '#8aa0b8', text: '#ffffff', label: 'CUSTOM' },
};

const LEGACY_LIGHT_PRESETS: PresetMap = {
  analysis: { fill: '#f5e6a3', stroke: '#b89400', text: '#5c4a00', label: 'ANALYSIS & DESIGN' },
  development: { fill: '#fcdea4', stroke: '#cc6d00', text: '#6b3800', label: 'DEVELOPMENT' },
  sit: { fill: '#c6e9c6', stroke: '#2e7c2e', text: '#174d17', label: 'SIT' },
  uat: { fill: '#beddfa', stroke: '#1565b5', text: '#0a3672', label: 'UAT' },
  live: { fill: '#f8baba', stroke: '#b52222', text: '#6b1010', label: 'LIVE' },
  concept: { fill: '#f5e6a3', stroke: '#b89400', text: '#5c4a00', label: 'CONCEPTUALISATION' },
  custom: { fill: '#e0e0e0', stroke: '#808080', text: '#333333', label: 'CUSTOM' },
};

const LEGACY_PRESETS_BY_THEME: Record<ThemeName, PresetMap> = {
  dark: LEGACY_DARK_PRESETS,
  light: LEGACY_LIGHT_PRESETS,
};

/** Legacy solid-bar colour scheme for a built-in phase id, or undefined if
 * the id isn't a built-in (caller falls back to the stored colour, which
 * preserves user-picked colours on custom phase types). */
export function getLegacyPhaseColors(
  id: string,
  theme: ThemeName = getActiveThemeName(),
): PhaseColorScheme | undefined {
  return LEGACY_PRESETS_BY_THEME[theme][id];
}

/**
 * Every fill that a built-in phase type has shipped with (legacy pastels, an
 * intermediate vivid set, and the current per-theme design fills). A built-in
 * type whose stored fill is in this set is treated as "theme-managed" and gets
 * refreshed to the active theme; a fill outside it means the user picked their
 * own colour, which we never override.
 */
const KNOWN_BUILTIN_FILLS: Record<string, Set<string>> = {
  analysis: new Set(['#f5e6a3', '#f5c84b', '#0098cc', '#3e7e99', '#cfe6f1']),
  development: new Set(['#fcdea4', '#f2914a', '#cb6600', '#bd7a40', '#f1ddc4']),
  sit: new Set(['#c6e9c6', '#5fd98a', '#009991', '#3e867f', '#cfe7e4']),
  uat: new Set(['#beddfa', '#56c2e8', '#31bf69', '#4e9168', '#d6efdf']),
  live: new Set(['#f8baba', '#e8657a', '#d23a52', '#99001b', '#a85563', '#f1d4d9']),
  concept: new Set(['#f5e6a3', '#4fd3c9', '#0098cc', '#3e7e99', '#cfe6f1']),
  custom: new Set(['#e0e0e0', '#b8c4d4', '#8aa0b8', '#c2ccd6', '#6e7e92', '#dde3ea']),
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
  fill: '#8aa0b8',
  stroke: '#4a5a72',
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
