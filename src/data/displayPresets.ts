import type { GanttState } from '../types/gantt';

/**
 * Display presets — named bundles of the canvas adornment toggles (design
 * system: phase-bar card). Milestones and weekends are content-adjacent and
 * stay on in every preset; the presets vary how much delivery/workload
 * detail bars carry. No new persisted state: the individual booleans remain
 * the source of truth, and the active preset is *derived* by matrix match —
 * any manual toggle that leaves the matrix simply reads as "Custom".
 */
export type DisplayPreset = 'minimal' | 'delivery' | 'workload';

export type PresetToggles = Pick<GanttState,
  | 'showWeekends'
  | 'showHolidays'
  | 'showMilestones'
  | 'showBarDates'
  | 'showEnvIndicators'
  | 'showEnvMarquees'
  | 'showContention'
  | 'showPeopleIndicators'
  | 'showPeopleContention'
>;

export const PRESET_MATRIX: Record<DisplayPreset, PresetToggles> = {
  /** The bar, nothing else. New plans start here. */
  minimal: {
    showWeekends: true,
    showHolidays: false,
    showMilestones: true,
    showBarDates: false,
    showEnvIndicators: false,
    showEnvMarquees: false,
    showContention: false,
    showPeopleIndicators: false,
    showPeopleContention: false,
  },
  /** The everyday view: dates, env dots, env-contention ribbons. */
  delivery: {
    showWeekends: true,
    showHolidays: true,
    showMilestones: true,
    showBarDates: true,
    showEnvIndicators: true,
    showEnvMarquees: false,
    showContention: true,
    showPeopleIndicators: false,
    showPeopleContention: false,
  },
  /** Who's on what: people chips + double-booking ribbons (dates off — the
   * chips take that room). */
  workload: {
    showWeekends: true,
    showHolidays: true,
    showMilestones: true,
    showBarDates: false,
    showEnvIndicators: true,
    showEnvMarquees: true,
    showContention: true,
    showPeopleIndicators: true,
    showPeopleContention: true,
  },
};

export const PRESET_LABELS: Record<DisplayPreset, { name: string; hint: string }> = {
  minimal: { name: 'Minimal', hint: 'Bars and go-lives only' },
  delivery: { name: 'Delivery', hint: 'Dates, environments, contention' },
  workload: { name: 'Workload', hint: 'People chips, double-bookings' },
};

/** The preset the current toggles exactly match, or null → "Custom". */
export function matchDisplayPreset(s: PresetToggles): DisplayPreset | null {
  for (const preset of Object.keys(PRESET_MATRIX) as DisplayPreset[]) {
    const m = PRESET_MATRIX[preset];
    if ((Object.keys(m) as (keyof PresetToggles)[]).every(k => s[k] === m[k])) {
      return preset;
    }
  }
  return null;
}
