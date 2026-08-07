import type { PlanSource, PlanBaseline, PlanMarker } from './planSource';

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
  /** People executing this phase (Person ids). Every person is an exclusive
   * resource: the same person on two overlapping bars on different swimlanes
   * is flagged as people contention. Empty = unassigned. */
  assigneeIds: string[];
  /** Teams executing this phase (Team ids). A team is an atomic exclusive
   * resource just like a person — a team assignment does NOT expand to its
   * members for contention purposes. Empty = unassigned. */
  teamIds: string[];
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
  /** Optional user-chosen tint (hex) for the section's header band. Applied as
   * a translucent overlay on the header (left panel + timeline) and as the
   * left-edge accent colour. undefined = default surface + accent. Uses the
   * same SWIMLANE_COLOR_PRESETS palette and SWIMLANE_TINT_ALPHA opacity. */
  color?: string;
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
  /** Optional user-chosen row tint (hex, e.g. '#3e63dd'). Applied as a
   * translucent band over the themed row background on both the left panel
   * and the timeline. undefined = no tint (default even/odd striping). */
  color?: string;
  /** People who OWN this project (ownership label, shown as chips beside the
   * project name). Ownership does not participate in contention. */
  assigneeIds: string[];
  /** Teams who OWN this project — same ownership-label semantics. */
  teamIds: string[];
}

// Swimlane row tint palette — 8 distinct hues at medium saturation, picked so
// they read clearly as a translucent band over both the dark and light row
// backgrounds. Applied at SWIMLANE_TINT_ALPHA opacity.
export const SWIMLANE_COLOR_PRESETS = [
  '#e5484d', // red
  '#f76b15', // orange
  '#ffb224', // amber
  '#46a758', // green
  '#00a2c7', // cyan
  '#3e63dd', // blue
  '#8e4ec6', // purple
  '#e93d82', // pink
] as const;

/** Opacity used when compositing a swimlane's tint over the row background. */
export const SWIMLANE_TINT_ALPHA = 0.32;

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

/** A group of people that can be allocated to work as a unit. Teams are
 * planning resources inside the document (like Environments), not accounts. */
export interface Team {
  id: string;
  name: string;
  color: string;
  order: number;
}

/** A person that can be allocated to execute planned work. People are
 * planning resources inside the document — they never log in. */
export interface Person {
  id: string;
  name: string;
  /** Optional role shown alongside the name, e.g. "BA", "Backend Dev". */
  role?: string;
  color: string;
  order: number;
  /** Team this person belongs to (grouping in the People panel + pickers).
   * null/undefined = not in a team. Membership is organisational only — it
   * does not link the person's bookings to the team's for contention. */
  teamId?: string | null;
}

export interface TimelineConfig {
  startMonth: number;
  startYear: number;
  totalWeeks: number;
  weekWidthPx: number;
}

/** How phase bars are presented. Affects SHAPE only — both styles colour the
 *  bar with the phase type's own configured colour:
 *   - `tagged` (default): neutral card body + a thin phase-coloured left edge.
 *   - `legacy`: solid pill filled with the phase colour. */
export type BarStyle = 'tagged' | 'legacy';

/** Tabs on the right-edge rail. One panel open at a time; the strip itself is
 * always visible. Order mirrors the old toolbar buttons. */
export type RailTab = 'inspector' | 'notes' | 'environments' | 'people';

export interface GanttState {
  sections: Section[];
  swimlanes: Swimlane[];
  phaseBars: PhaseBar[];
  milestones: Milestone[];
  dependencies: Dependency[];
  actionItems: ActionItem[];
  floatingNotes: FloatingNote[];
  environments: Environment[];
  teams: Team[];
  people: Person[];
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
  showPeopleIndicators: boolean;
  showPeopleContention: boolean;
  barStyle: BarStyle;
  // Ephemeral (not persisted/snapshotted)
  lastUsedPhaseType: PhaseType;
  creatingBarId: string | null;
  isSpaceHeld: boolean;
  /** Which rail tab's panel is open (one at a time), or null for none.
   * Replaces the three independent panel booleans. */
  railTab: RailTab | null;
  notesPanelSwimlaneId: string | null;
  notesPanelFilterId: string | null;
  environmentFocusId: string | null;
  /** Focused resource in people focus mode — dims bars not assigned to it. */
  peopleFocus: { kind: 'person' | 'team'; id: string } | null;
  hoveredBarId: string | null;
  phaseTypesModalOpen: boolean;
  // File session state (not persisted — handles are session-scoped and
  // localStorage is a crash-recovery backstop, not the source of truth)
  currentFileName: string | null;
  /** Where the open plan lives (local file or Microsoft 365), or null for an
   * unsaved document. Replaces the old handle-only field. */
  planSource: PlanSource | null;
  isDirty: boolean;
  // Shared-file collaboration state (all session-scoped, never persisted).
  /** Provenance of the open file — who last saved it and when (from the
   * file's `meta` block; null when unknown or no file is open). */
  fileMeta: FileMeta | null;
  /** The version this session considers "ours" — set on open and after each
   * successful save. A newer version at the source means someone else saved.
   * null = no baseline (nothing open). */
  baseline: PlanBaseline | null;
  /** Set when a newer version was detected at the source (poll/focus check).
   * Renders the non-blocking update banner. */
  externalUpdate: (FileMeta & { marker: PlanMarker }) | null;
  /** Newest marker the user chose to ignore via "Keep mine" — suppresses the
   * banner until an even newer version appears. */
  externalUpdateDismissedMarker: PlanMarker | null;
  /** Set when Save found the file changed since our baseline.
   * Renders the Overwrite / Reload / Save-a-copy conflict dialog. */
  saveConflict: FileMeta | null;
  /** Which screen is showing. The launcher only exists when signed in. */
  appView: 'launcher' | 'plan';
}

/** Save-attribution block stamped into exported plan files (schema v7+).
 * `savedById` is the signer's Entra object id when they were signed in to
 * Microsoft 365; a bare `savedBy` is a self-declared name — provenance,
 * not authentication. */
export interface FileMeta {
  savedBy: string | null;
  savedById: string | null;
  savedAtIso: string | null;
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

// People/team palette — deliberately offset from ENV_COLOR_PRESETS hues so a
// person chip and an env dot on the same bar don't read as the same series.
export const PEOPLE_COLOR_PRESETS = [
  '#d81b60', // raspberry
  '#5e35b1', // deep violet
  '#039be5', // sky blue
  '#00897b', // teal
  '#7cb342', // leaf green
  '#c0ca33', // lime
  '#ef6c00', // burnt orange
  '#6d4c41', // cocoa
] as const;

// Layout constants matching draw.io diagram
export const ROW_HEIGHT = 48;
// Taller row used only while exporting, so Key Features lists fit. Must stay
// in sync with the `--row-height` override in `.gantt-container.is-exporting`
// (src/App.css) — the timeline SVG and the DOM panels both read this height.
// Sized so a generous (~8-bullet) feature list fits without overlapping the
// next row; pathologically long lists can still overflow.
export const EXPORT_ROW_HEIGHT = 104;
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
