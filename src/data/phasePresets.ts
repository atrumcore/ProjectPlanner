import type { PhaseType, PhaseColorScheme, PhaseTypeDef } from '../types/gantt';

/** Legacy lookup retained for code that hasn't migrated yet, and used as
 * the fallback when a bar references a phase type id that is no longer in
 * state.phaseTypes (e.g. a user deleted a custom type that was still in
 * use somewhere). */
export const PHASE_PRESETS: Record<string, PhaseColorScheme> = {
  analysis: {
    fill: '#f5e6a3',
    stroke: '#b89400',
    text: '#5c4a00',
    label: 'ANALYSIS & DESIGN',
  },
  development: {
    fill: '#fcdea4',
    stroke: '#cc6d00',
    text: '#6b3800',
    label: 'DEVELOPMENT',
  },
  sit: {
    fill: '#c6e9c6',
    stroke: '#2e7c2e',
    text: '#174d17',
    label: 'SIT',
  },
  uat: {
    fill: '#beddfa',
    stroke: '#1565b5',
    text: '#0a3672',
    label: 'UAT',
  },
  live: {
    fill: '#f8baba',
    stroke: '#b52222',
    text: '#6b1010',
    label: 'LIVE',
  },
  concept: {
    fill: '#f5e6a3',
    stroke: '#b89400',
    text: '#5c4a00',
    label: 'CONCEPTUALISATION',
  },
  custom: {
    fill: '#e0e0e0',
    stroke: '#808080',
    text: '#333333',
    label: 'CUSTOM',
  },
};

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
  fill: '#e0e0e0',
  stroke: '#808080',
  text: '#333333',
  order: 999,
};

/** Built-in phase types seeded into state on first load. Stable ids match
 * the legacy `PhaseType` string union, so existing bars keep resolving. */
export const BUILTIN_PHASE_TYPES: PhaseTypeDef[] = PHASE_TYPE_OPTIONS.map((opt, i) => ({
  id: opt.value,
  name: opt.label,
  label: PHASE_PRESETS[opt.value].label,
  fill: PHASE_PRESETS[opt.value].fill,
  stroke: PHASE_PRESETS[opt.value].stroke,
  text: PHASE_PRESETS[opt.value].text,
  order: i,
}));

/** Find a phase type definition by id; returns FALLBACK_PHASE_DEF if missing. */
export function getPhaseDef(id: PhaseType, types: PhaseTypeDef[]): PhaseTypeDef {
  const found = types.find(t => t.id === id);
  if (found) return found;
  // Fall back to legacy preset for any built-in id (in case state.phaseTypes
  // wasn't seeded for some reason).
  const preset = PHASE_PRESETS[id];
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
