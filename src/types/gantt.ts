/** PhaseType is now a string id referring to a user-defined PhaseTypeDef.
 * The 7 built-ins ('analysis', 'development', 'sit', 'uat', 'live', 'concept',
 * 'custom') are seeded on first run with stable ids so legacy data loads
 * unchanged. New user-created types get UUIDs. */
export type PhaseType = string;

export interface PhaseColorScheme {
  fill: string;
  stroke: string;
  text: string;
  label: string;
}

export interface PhaseTypeDef {
  id: string;
  name: string;       // Display name in pickers, e.g. "Analysis & Design"
  label: string;      // Uppercase label rendered on the bar, e.g. "ANALYSIS & DESIGN"
  fill: string;
  stroke: string;
  text: string;
  order: number;
}

export interface PhaseBar {
  id: string;
  swimlaneId: string;
  phaseType: PhaseType;
  label: string;
  startWeek: number;
  durationWeeks: number;
  colorOverride?: PhaseColorScheme;
  /** Environment slot this bar reserves. Two bars on different swimlanes
   * sharing the same Exclusive env that overlap in time are flagged as
   * contention. null = unassigned, contributes nothing to contention. */
  environmentId: string | null;
}

export interface Milestone {
  id: string;
  swimlaneId: string;
  week: number;
}

export interface Dependency {
  id: string;
  fromBarId: string;
  toBarId: string;
}

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  done: boolean;
  swimlaneId: string | null;
  createdAt: string;
}

export type SwimlaneSection = string;

export interface Section {
  id: string;
  label: string;
  order: number;
}

export const DEFAULT_SECTIONS: Section[] = [
  { id: 'delivered', label: 'Delivered', order: 0 },
  { id: 'in-progress', label: 'In Progress', order: 1 },
];

export interface Swimlane {
  id: string;
  projectName: string;
  keyFeatures: string; // HTML string (rich text)
  keyDependencies: string; // HTML string (rich text)
  section: SwimlaneSection;
  order: number;
}

export interface FloatingNote {
  id: string;
  /** Position in timeline-content pixel coordinates (top-left of the note). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** HTML string (rich text via contentEditable). */
  text: string;
  /** Background color — pastel sticky-note hue. */
  color: string;
}

export const FLOATING_NOTE_COLORS = [
  '#fff3a8', // yellow
  '#ffd1dc', // pink
  '#c5e1ff', // blue
  '#d4f0c2', // green
  '#e0d7ff', // lavender
  '#ffd6a5', // peach
] as const;

export const FLOATING_NOTE_DEFAULT_WIDTH = 200;
export const FLOATING_NOTE_DEFAULT_HEIGHT = 120;
export const FLOATING_NOTE_MIN_WIDTH = 120;
export const FLOATING_NOTE_MIN_HEIGHT = 70;

export interface Environment {
  id: string;
  name: string;
  color: string;
  order: number;
  /** When true, two bars whose phase type maps to this env on different
   * swimlanes overlapping in time are flagged as contention. When false,
   * the env is treated as a shared resource and never produces contention. */
  exclusive: boolean;
}

export interface TimelineConfig {
  startMonth: number;
  startYear: number;
  totalWeeks: number;
  weekWidthPx: number;
}

export interface GanttState {
  sections: Section[];
  swimlanes: Swimlane[];
  phaseBars: PhaseBar[];
  milestones: Milestone[];
  dependencies: Dependency[];
  actionItems: ActionItem[];
  floatingNotes: FloatingNote[];
  environments: Environment[];
  phaseTypes: PhaseTypeDef[];
  timeline: TimelineConfig;
  selectedBarId: string | null;
  dragIndicatorWeek: number | null;
  // UI preferences (persisted, not snapshotted)
  showMonthDates: boolean;
  showBarDates: boolean;
  showWeekends: boolean;
  showHolidays: boolean;
  showMilestones: boolean;
  showEnvIndicators: boolean;
  showEnvMarquees: boolean;
  showContention: boolean;
  // Ephemeral (not persisted/snapshotted)
  lastUsedPhaseType: PhaseType;
  creatingBarId: string | null;
  isSpaceHeld: boolean;
  notesPanelOpen: boolean;
  notesPanelSwimlaneId: string | null;
  notesPanelFilterId: string | null;
  environmentsPanelOpen: boolean;
  environmentFocusId: string | null;
  hoveredBarId: string | null;
  phaseTypesModalOpen: boolean;
  // File session state (not persisted — handles are session-scoped and
  // localStorage is a crash-recovery backstop, not the source of truth)
  currentFileName: string | null;
  currentFileHandle: FileSystemFileHandle | null;
  isDirty: boolean;
}

// Environment palette — 8 hues spaced ~45° apart on the colour wheel with
// strong saturation differences, picked so the dashed marquee stroke and
// 10px env-dot remain clearly distinguishable side-by-side.
export const ENV_COLOR_PRESETS = [
  '#e53935', // vivid red
  '#f57c00', // bright orange
  '#fbc02d', // amber/yellow
  '#43a047', // vivid green
  '#00acc1', // bright cyan
  '#1e88e5', // bright blue
  '#8e24aa', // vivid purple
  '#455a64', // slate charcoal
] as const;

// Layout constants matching draw.io diagram
export const ROW_HEIGHT = 48;
export const PROJECT_COL_WIDTH = 140;
export const FEATURES_COL_WIDTH = 164;
export const DEPS_COL_WIDTH = 180;
export const HEADER_HEIGHT = 48;
export const WEEK_LABEL_HEIGHT = 18;
export const WEEK_WIDTH = 36;
export const BAR_HEIGHT = 30;
export const BAR_RADIUS = 8;
export const MILESTONE_WIDTH = 10;
export const LEFT_PANEL_WIDTH = PROJECT_COL_WIDTH + FEATURES_COL_WIDTH;
export const SECTION_HEADER_HEIGHT = 40;
