export type PhaseType =
  | 'analysis'
  | 'development'
  | 'sit'
  | 'uat'
  | 'live'
  | 'concept'
  | 'custom';

export interface PhaseColorScheme {
  fill: string;
  stroke: string;
  text: string;
  label: string;
}

export interface PhaseBar {
  id: string;
  swimlaneId: string;
  phaseType: PhaseType;
  label: string;
  startWeek: number;
  durationWeeks: number;
  colorOverride?: PhaseColorScheme;
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
  timeline: TimelineConfig;
  selectedBarId: string | null;
  dragIndicatorWeek: number | null;
  // UI preferences (persisted, not snapshotted)
  showMonthDates: boolean;
  showBarDates: boolean;
  showWeekends: boolean;
  showHolidays: boolean;
  showMilestones: boolean;
  // Ephemeral (not persisted/snapshotted)
  lastUsedPhaseType: PhaseType;
  creatingBarId: string | null;
  isSpaceHeld: boolean;
  notesPanelOpen: boolean;
  notesPanelSwimlaneId: string | null;
  notesPanelFilterId: string | null;
  // File session state (not persisted — handles are session-scoped and
  // localStorage is a crash-recovery backstop, not the source of truth)
  currentFileName: string | null;
  currentFileHandle: FileSystemFileHandle | null;
  isDirty: boolean;
}

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
