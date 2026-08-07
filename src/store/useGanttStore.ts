import { create } from 'zustand';
import type {
  GanttState,
  Swimlane,
  PhaseBar,
  ActionItem,
  TimelineConfig,
  SwimlaneSection,
  Section,
  Environment,
  Team,
  Person,
  PhaseTypeDef,
  FloatingNote,
  FileMeta,
} from '../types/gantt';
import type { PlanSource, PlanContainer, PlanMarker } from '../types/planSource';
import { graph, GraphConflictError, type GraphPlanFile } from '../graph';
import { rememberPlan } from '../utils/mru';
// PhaseBar imported above; alias for the migration helper signature.
import {
  DEFAULT_SECTIONS,
  ENV_COLOR_PRESETS,
  PEOPLE_COLOR_PRESETS,
  FLOATING_NOTE_COLORS,
  FLOATING_NOTE_DEFAULT_WIDTH,
  FLOATING_NOTE_DEFAULT_HEIGHT,
  FLOATING_NOTE_MIN_WIDTH,
  FLOATING_NOTE_MIN_HEIGHT,
} from '../types/gantt';
import { pickNextEnvColor } from '../utils/contention';
import { getBuiltinPhaseTypes, getPhaseDef, deriveColorScheme, applyThemePresetsToBuiltins } from '../data/phasePresets';
import type { ThemeName } from '../theme/colors';
import { getDaysInMonth } from '../utils/dateUtils';
import { featuresArrayToHtml } from '../utils/htmlSanitize';
import {
  isFileSystemAccessSupported,
  pickOpenFile,
  pickSaveFile,
  readFileAsText,
  writeFileText,
  downloadTextFile,
  pickUploadFile,
  getFileLastModified,
} from '../utils/fileSystemAccess';
import { getUserName } from '../utils/userName';
import { useAuthStore } from '../auth/useAuthStore';

const uid = () => crypto.randomUUID();

const STORAGE_KEY = 'bbd-planner-state';
const MAX_HISTORY = 50;

// Single version stamp written by BOTH localStorage autosave and file export.
// History: v2 real-calendar model · v5 env exclusive flag · v6 bar environmentId
// · v7 teams/people + bar/lane assigneeIds+teamIds.
// Bump when the schema changes and add a matching migration in loadFromStorage /
// importFromJSON (they run idempotent field migrations regardless of version;
// the only hard gate is `< 2`, which discards pre-real-calendar data).
const SCHEMA_VERSION = 7;

interface GanttActions {
  // Sections
  addSection: (label: string) => void;
  removeSection: (id: string) => void;
  updateSection: (id: string, updates: Partial<Omit<Section, 'id'>>) => void;

  // Swimlane
  addSwimlane: (name: string, section: SwimlaneSection) => void;
  updateSwimlane: (id: string, updates: Partial<Swimlane>) => void;
  removeSwimlane: (id: string) => void;
  reorderSwimlane: (id: string, newOrder: number) => void;

  // Phase bars
  addPhaseBar: (bar: Omit<PhaseBar, 'id'>) => void;
  updatePhaseBar: (id: string, updates: Partial<PhaseBar>) => void;
  removePhaseBar: (id: string) => void;
  moveBar: (id: string, startWeek: number, swimlaneId?: string) => void;
  resizeBar: (id: string, startWeek: number, durationWeeks: number) => void;

  // Milestones
  addMilestone: (swimlaneId: string, week: number) => void;
  updateMilestone: (id: string, updates: Partial<{ swimlaneId: string; week: number }>) => void;
  removeMilestone: (id: string) => void;

  // Timeline
  extendTimeline: (additionalWeeks: number) => void;
  prependMonth: () => void;
  trimStart: () => void;
  trimEnd: (weeks: number) => void;
  setTimelineConfig: (config: Partial<TimelineConfig>) => void;

  // Drag
  beginDrag: () => void;
  setDragIndicator: (week: number | null) => void;

  // Zoom
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;

  // Quick-add
  quickAddPhaseBar: (swimlaneId: string, startWeek: number, durationWeeks: number) => string;
  clearCreatingBar: () => void;
  setSpaceHeld: (held: boolean) => void;

  // Selection
  selectBar: (id: string | null) => void;

  // Action items
  addActionItem: (text: string, swimlaneId?: string | null) => void;
  updateActionItem: (id: string, updates: Partial<ActionItem>) => void;
  removeActionItem: (id: string) => void;
  clearDoneActionItems: () => void;

  // Floating notes (free-positioned sticky notes)
  addFloatingNote: (x: number, y: number) => string;
  updateFloatingNote: (id: string, updates: Partial<Omit<FloatingNote, 'id'>>) => void;
  moveFloatingNote: (id: string, x: number, y: number) => void;
  resizeFloatingNote: (id: string, width: number, height: number) => void;
  removeFloatingNote: (id: string) => void;
  beginFloatingNoteDrag: () => void;

  // Notes panel
  toggleNotesPanel: () => void;
  openNotesPanelForSwimlane: (swimlaneId: string) => void;
  openNotesPanelFiltered: (swimlaneId: string) => void;
  setNotesPanelFilter: (id: string | null) => void;
  clearNotesPanelFilter: () => void;

  // Environments
  addEnvironment: (name: string, color?: string) => string;
  updateEnvironment: (id: string, updates: Partial<Omit<Environment, 'id'>>) => void;
  removeEnvironment: (id: string) => void;
  reorderEnvironments: (orderedIds: string[]) => void;
  setEnvironmentExclusive: (envId: string, exclusive: boolean) => void;
  setBarEnvironment: (barId: string, envId: string | null) => void;
  toggleEnvironmentsPanel: () => void;
  setEnvironmentFocus: (envId: string | null) => void;
  setHoveredBar: (id: string | null) => void;

  // People & teams
  addTeam: (name: string, color?: string) => string;
  updateTeam: (id: string, updates: Partial<Omit<Team, 'id'>>) => void;
  removeTeam: (id: string) => void;
  addPerson: (name: string, opts?: { role?: string; teamId?: string | null; color?: string }) => string;
  updatePerson: (id: string, updates: Partial<Omit<Person, 'id'>>) => void;
  removePerson: (id: string) => void;
  /** Replace a bar's execution allocation (people + teams) in one action. */
  setBarPeople: (barId: string, allocation: { assigneeIds?: string[]; teamIds?: string[] }) => void;
  /** Replace a swimlane's ownership chips (people + teams) in one action. */
  setSwimlaneOwners: (laneId: string, owners: { assigneeIds?: string[]; teamIds?: string[] }) => void;
  /** Merge people & teams from another plan's JSON export (by id; existing
   * entries win). Returns how many were added, or null on parse failure. */
  importPeopleFromJSON: (json: string) => { people: number; teams: number } | null;
  togglePeoplePanel: () => void;
  setPeopleFocus: (focus: { kind: 'person' | 'team'; id: string } | null) => void;

  // Phase types
  addPhaseType: (name?: string, baseColor?: string) => string;
  updatePhaseType: (id: string, updates: Partial<Omit<PhaseTypeDef, 'id'>>) => void;
  removePhaseType: (id: string) => void;
  reorderPhaseTypes: (orderedIds: string[]) => void;
  togglePhaseTypesModal: () => void;
  resetPhaseTypesToBuiltins: () => void;
  /** Refresh theme-managed built-in phase colours to the given theme (cosmetic;
   * does not mark the document dirty or push undo). */
  syncBuiltinPhaseColorsToTheme: (theme: ThemeName) => void;

  // UI preferences
  toggleMonthDates: () => void;
  toggleBarDates: () => void;
  toggleWeekends: () => void;
  toggleHolidays: () => void;
  toggleMilestones: () => void;
  toggleEnvIndicators: () => void;
  toggleEnvMarquees: () => void;
  toggleContention: () => void;
  togglePeopleIndicators: () => void;
  togglePeopleContention: () => void;
  setBarStyle: (style: import('../types/gantt').BarStyle) => void;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => boolean;
  exportToJSON: () => string;
  importFromJSON: (json: string) => void;

  // File operations (Chromium-only, File System Access API)
  /** Save to the current file. When another editor saved the file after our
   * baseline, sets `saveConflict` and returns false instead of writing —
   * pass `{ force: true }` (from the conflict dialog) to overwrite anyway. */
  saveFile: (opts?: { force?: boolean }) => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
  openFile: () => Promise<boolean>;
  newFile: () => void;
  /** Compare the open file's on-disk lastModified against our baseline and
   * surface `externalUpdate` when someone else saved. Called on window focus
   * and on a slow poll. No-op without a file handle. */
  checkFileFreshness: () => Promise<void>;
  /** Re-read the current file from disk, replacing local state. */
  reloadFromDisk: () => Promise<boolean>;
  dismissExternalUpdate: () => void;
  clearSaveConflict: () => void;
  /** Open a plan stored in Microsoft 365 (a Team's Roadmaps folder or drafts). */
  openGraphPlan: (file: GraphPlanFile & { container: PlanContainer }) => Promise<boolean>;
  /** Create a blank plan in a Team (creating its Roadmaps folder if needed)
   * or in the user's drafts, then open it. */
  createGraphPlan: (container: PlanContainer, name: string) => Promise<boolean>;
  setAppView: (view: 'launcher' | 'plan') => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

type GanttStore = GanttState & GanttActions;

const defaultState: GanttState = {
  sections: DEFAULT_SECTIONS,
  swimlanes: [],
  phaseBars: [],
  milestones: [],
  dependencies: [],
  actionItems: [],
  floatingNotes: [],
  environments: [],
  teams: [],
  people: [],
  phaseTypes: getBuiltinPhaseTypes(),
  timeline: {
    startMonth: 0, // January
    startYear: 2026,
    totalWeeks: 35, // Jan through August 2026 (real calendar weeks)
    weekWidthPx: 36,
  },
  selectedBarId: null,
  dragIndicatorWeek: null,
  showMonthDates: false,
  showBarDates: false,
  showWeekends: true,
  showHolidays: true,
  showMilestones: true,
  showEnvIndicators: true,
  showEnvMarquees: true,
  showContention: true,
  showPeopleIndicators: true,
  showPeopleContention: true,
  barStyle: 'tagged',
  lastUsedPhaseType: 'development',
  creatingBarId: null,
  isSpaceHeld: false,
  notesPanelOpen: false,
  notesPanelSwimlaneId: null,
  notesPanelFilterId: null,
  environmentsPanelOpen: false,
  environmentFocusId: null,
  peoplePanelOpen: false,
  peopleFocus: null,
  hoveredBarId: null,
  phaseTypesModalOpen: false,
  currentFileName: null,
  planSource: null,
  isDirty: false,
  fileMeta: null,
  baseline: null,
  externalUpdate: null,
  externalUpdateDismissedMarker: null,
  saveConflict: null,
  appView: 'plan',
};

/** Extract the save-attribution meta block from a plan file's JSON text. */
function parseFileMeta(text: string): FileMeta {
  try {
    const d = JSON.parse(text);
    return {
      savedBy: typeof d?.meta?.savedBy === 'string' ? d.meta.savedBy : null,
      savedById: typeof d?.meta?.savedById === 'string' ? d.meta.savedById : null,
      savedAtIso: typeof d?.meta?.savedAtIso === 'string' ? d.meta.savedAtIso : null,
    };
  } catch {
    return { savedBy: null, savedById: null, savedAtIso: null };
  }
}

/** Who to credit for a save right now — the signed-in Microsoft account when
 *  there is one, otherwise the locally-entered display name. */
function currentSaveIdentity(): FileMeta {
  const account = useAuthStore.getState().account;
  return {
    savedBy: account?.name ?? getUserName(),
    savedById: account?.id ?? null,
    savedAtIso: new Date().toISOString(),
  };
}

// History stacks stored outside zustand to avoid serialization issues
let undoStack: GanttState[] = [];
let redoStack: GanttState[] = [];

function snapshot(state: GanttState): GanttState {
  return JSON.parse(JSON.stringify({
    sections: state.sections,
    swimlanes: state.swimlanes,
    phaseBars: state.phaseBars,
    milestones: state.milestones,
    dependencies: state.dependencies,
    actionItems: state.actionItems,
    floatingNotes: state.floatingNotes,
    environments: state.environments,
    teams: state.teams,
    people: state.people,
    phaseTypes: state.phaseTypes,
    timeline: state.timeline,
    selectedBarId: state.selectedBarId,
  }));
}

function pushUndo(state: GanttState) {
  undoStack.push(snapshot(state));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

/** Keep only entries that are valid string ids. */
function idArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Migrate legacy keyFeatures: string[] → HTML string. Strips the deprecated
 * environmentId field (v4 → v5). v6 → v7 adds owner assigneeIds/teamIds.
 * Idempotent. */
function migrateSwimlanes(swimlanes: unknown): Swimlane[] {
  if (!Array.isArray(swimlanes)) return [];
  return swimlanes.map(raw => {
    const s = raw as Swimlane & { keyFeatures: string | string[]; environmentId?: unknown };
    const features = Array.isArray(s.keyFeatures)
      ? featuresArrayToHtml(s.keyFeatures)
      : s.keyFeatures;
    return {
      id: s.id,
      projectName: s.projectName,
      keyFeatures: features,
      keyDependencies: s.keyDependencies,
      section: s.section,
      order: s.order,
      ...(typeof s.color === 'string' ? { color: s.color } : {}),
      assigneeIds: idArray(s.assigneeIds),
      teamIds: idArray(s.teamIds),
    };
  });
}

/** v4 → v5 migration: convert env.overlapAllowedPhaseTypes to env.exclusive,
 * and ensure phase types carry defaultEnvironmentId. Idempotent. */
function migrateEnvironments(envs: unknown): Environment[] {
  if (!Array.isArray(envs)) return [];
  return envs.map(raw => {
    const e = raw as Environment & { overlapAllowedPhaseTypes?: unknown };
    const exclusive = typeof (e as { exclusive?: unknown }).exclusive === 'boolean'
      ? (e as { exclusive: boolean }).exclusive
      : Array.isArray(e.overlapAllowedPhaseTypes)
        ? e.overlapAllowedPhaseTypes.length === 0
        : true;
    return {
      id: e.id,
      name: e.name,
      color: e.color,
      order: e.order,
      exclusive,
    };
  });
}

function migratePhaseTypes(types: unknown): PhaseTypeDef[] {
  const list = Array.isArray(types) && types.length > 0 ? types : getBuiltinPhaseTypes();
  const mapped = list.map((raw: any) => ({
    id: raw.id,
    name: raw.name,
    label: raw.label,
    fill: raw.fill,
    stroke: raw.stroke,
    text: raw.text,
    order: raw.order,
  }));
  // Built-in types that still carry a shipped (theme-managed) fill are refreshed
  // to the active theme's design-system colours; custom types and user-recoloured
  // built-ins are left untouched.
  return applyThemePresetsToBuiltins(mapped);
}

/** v5 → v6: ensure every bar carries `environmentId` (null when missing).
 * v6 → v7: ensure assigneeIds/teamIds arrays. */
function migratePhaseBars(bars: unknown): PhaseBar[] {
  if (!Array.isArray(bars)) return [];
  return bars.map((raw: any) => ({
    id: raw.id,
    swimlaneId: raw.swimlaneId,
    phaseType: raw.phaseType,
    label: raw.label,
    startWeek: raw.startWeek,
    durationWeeks: raw.durationWeeks,
    colorOverride: raw.colorOverride,
    environmentId: raw.environmentId ?? null,
    assigneeIds: idArray(raw.assigneeIds),
    teamIds: idArray(raw.teamIds),
  }));
}

/** v7: validate the teams array (absent in older documents). */
function migrateTeams(teams: unknown): Team[] {
  if (!Array.isArray(teams)) return [];
  return teams
    .filter((raw: any) => raw && typeof raw.id === 'string' && typeof raw.name === 'string')
    .map((raw: any, i: number) => ({
      id: raw.id,
      name: raw.name,
      color: typeof raw.color === 'string' ? raw.color : PEOPLE_COLOR_PRESETS[i % PEOPLE_COLOR_PRESETS.length],
      order: typeof raw.order === 'number' ? raw.order : i,
    }));
}

/** v7: validate the people array (absent in older documents). */
function migratePeople(people: unknown): Person[] {
  if (!Array.isArray(people)) return [];
  return people
    .filter((raw: any) => raw && typeof raw.id === 'string' && typeof raw.name === 'string')
    .map((raw: any, i: number) => ({
      id: raw.id,
      name: raw.name,
      ...(typeof raw.role === 'string' && raw.role ? { role: raw.role } : {}),
      color: typeof raw.color === 'string' ? raw.color : PEOPLE_COLOR_PRESETS[i % PEOPLE_COLOR_PRESETS.length],
      order: typeof raw.order === 'number' ? raw.order : i,
      teamId: typeof raw.teamId === 'string' ? raw.teamId : null,
    }));
}

function ensureTodayVisible(
  get: () => GanttStore,
  set: (partial: Partial<GanttState>) => void
) {
  const { timeline } = get();
  const now = new Date();
  // Walk real month lengths from timeline start to 2 months past today
  let targetMonth = now.getMonth() + 2;
  let targetYear = now.getFullYear();
  if (targetMonth >= 12) { targetMonth -= 12; targetYear++; }

  let days = 0;
  let m = timeline.startMonth;
  let y = timeline.startYear;
  while (y < targetYear || (y === targetYear && m <= targetMonth)) {
    days += getDaysInMonth(m, y);
    m++;
    if (m >= 12) { m = 0; y++; }
  }
  const needed = Math.ceil(days / 7);
  if (needed > timeline.totalWeeks) {
    set({ timeline: { ...timeline, totalWeeks: needed } });
  }
}

export const useGanttStore = create<GanttStore>((set, get) => ({
  ...defaultState,

  // === Section actions ===
  addSection: (label) => {
    pushUndo(get());
    const maxOrder = get().sections.reduce((max, s) => Math.max(max, s.order), -1);
    set(state => ({
      sections: [...state.sections, { id: uid(), label, order: maxOrder + 1 }],
    }));
    get().saveToStorage();
  },

  removeSection: (id) => {
    const sections = get().sections;
    if (sections.length <= 1) return;
    pushUndo(get());
    const remaining = sections.filter(s => s.id !== id);
    const fallback = remaining.sort((a, b) => a.order - b.order)[0].id;
    set(state => ({
      sections: state.sections.filter(s => s.id !== id),
      swimlanes: state.swimlanes.map(s => s.section === id ? { ...s, section: fallback } : s),
    }));
    get().saveToStorage();
  },

  updateSection: (id, updates) => {
    pushUndo(get());
    set(state => ({
      sections: state.sections.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
    get().saveToStorage();
  },

  // === Swimlane actions ===
  addSwimlane: (name, section) => {
    pushUndo(get());
    const swimlanes = get().swimlanes.filter(s => s.section === section);
    const maxOrder = swimlanes.reduce((max, s) => Math.max(max, s.order), -1);
    set(state => ({
      swimlanes: [
        ...state.swimlanes,
        {
          id: uid(),
          projectName: name,
          keyFeatures: '',
          keyDependencies: '',
          section,
          order: maxOrder + 1,
          assigneeIds: [],
          teamIds: [],
        },
      ],
    }));
    get().saveToStorage();
  },

  updateSwimlane: (id, updates) => {
    pushUndo(get());
    set(state => ({
      swimlanes: state.swimlanes.map(s => (s.id === id ? { ...s, ...updates } : s)),
    }));
    get().saveToStorage();
  },

  removeSwimlane: (id) => {
    pushUndo(get());
    set(state => ({
      swimlanes: state.swimlanes.filter(s => s.id !== id),
      phaseBars: state.phaseBars.filter(b => b.swimlaneId !== id),
      milestones: state.milestones.filter(m => m.swimlaneId !== id),
    }));
    get().saveToStorage();
  },

  reorderSwimlane: (id, newOrder) => {
    pushUndo(get());
    set(state => ({
      swimlanes: state.swimlanes.map(s => (s.id === id ? { ...s, order: newOrder } : s)),
    }));
    get().saveToStorage();
  },

  // === Phase bar actions ===
  addPhaseBar: (bar) => {
    pushUndo(get());
    set(state => ({
      phaseBars: [
        ...state.phaseBars,
        {
          ...bar,
          id: uid(),
          environmentId: bar.environmentId ?? null,
          assigneeIds: bar.assigneeIds ?? [],
          teamIds: bar.teamIds ?? [],
        },
      ],
    }));
    get().saveToStorage();
  },

  updatePhaseBar: (id, updates) => {
    pushUndo(get());
    set(state => ({
      phaseBars: state.phaseBars.map(b => (b.id === id ? { ...b, ...updates } : b)),
      ...(updates.phaseType ? { lastUsedPhaseType: updates.phaseType } : {}),
    }));
    get().saveToStorage();
  },

  removePhaseBar: (id) => {
    pushUndo(get());
    set(state => ({
      phaseBars: state.phaseBars.filter(b => b.id !== id),
      dependencies: state.dependencies.filter(d => d.fromBarId !== id && d.toBarId !== id),
    }));
    get().saveToStorage();
  },

  moveBar: (id, startWeek, swimlaneId) => {
    set(state => ({
      phaseBars: state.phaseBars.map(b =>
        b.id === id
          ? { ...b, startWeek: Math.max(0, startWeek), ...(swimlaneId ? { swimlaneId } : {}) }
          : b
      ),
    }));
  },

  resizeBar: (id, startWeek, durationWeeks) => {
    set(state => ({
      phaseBars: state.phaseBars.map(b =>
        b.id === id
          ? { ...b, startWeek: Math.max(0, startWeek), durationWeeks: Math.max(1 / 7, durationWeeks) }
          : b
      ),
    }));
  },

  // === Milestone actions ===
  addMilestone: (swimlaneId, week) => {
    pushUndo(get());
    set(state => ({
      milestones: [...state.milestones, { id: uid(), swimlaneId, week }],
    }));
    get().saveToStorage();
  },

  updateMilestone: (id, updates) => {
    set(state => ({
      milestones: state.milestones.map(m => (m.id === id ? { ...m, ...updates } : m)),
    }));
  },

  removeMilestone: (id) => {
    pushUndo(get());
    set(state => ({
      milestones: state.milestones.filter(m => m.id !== id),
    }));
    get().saveToStorage();
  },

  // === Timeline actions ===
  extendTimeline: (additionalWeeks) => {
    pushUndo(get());
    set(state => ({
      timeline: { ...state.timeline, totalWeeks: state.timeline.totalWeeks + additionalWeeks },
    }));
    get().saveToStorage();
  },

  prependMonth: () => {
    pushUndo(get());
    set(state => {
      let newMonth = state.timeline.startMonth - 1;
      let newYear = state.timeline.startYear;
      if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      }
      // Shift by the month's REAL length in weeks (days/7), not ceil(days/7).
      // Bars and milestones are anchored to calendar dates via their week
      // offset from the timeline start; shifting by whole week-columns would
      // drift every date by (ceil(days/7)*7 - days) days per prepend.
      const weeksToAdd = getDaysInMonth(newMonth, newYear) / 7;
      return {
        timeline: {
          ...state.timeline,
          startMonth: newMonth,
          startYear: newYear,
          totalWeeks: state.timeline.totalWeeks + weeksToAdd,
        },
        phaseBars: state.phaseBars.map(b => ({ ...b, startWeek: b.startWeek + weeksToAdd })),
        milestones: state.milestones.map(m => ({ ...m, week: m.week + weeksToAdd })),
      };
    });
    get().saveToStorage();
  },

  trimStart: () => {
    pushUndo(get());
    set(state => {
      // Remove the first month's REAL length in weeks (days/7), not ceil, so
      // remaining bars/milestones keep their calendar dates. See prependMonth.
      const weeksToRemove = getDaysInMonth(state.timeline.startMonth, state.timeline.startYear) / 7;
      if (state.timeline.totalWeeks <= weeksToRemove) return state;
      let newMonth = state.timeline.startMonth + 1;
      let newYear = state.timeline.startYear;
      if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      }
      return {
        timeline: {
          ...state.timeline,
          startMonth: newMonth,
          startYear: newYear,
          totalWeeks: state.timeline.totalWeeks - weeksToRemove,
        },
        phaseBars: state.phaseBars.map(b => ({ ...b, startWeek: b.startWeek - weeksToRemove })),
        milestones: state.milestones.map(m => ({ ...m, week: m.week - weeksToRemove })),
      };
    });
    get().saveToStorage();
  },

  trimEnd: (weeks) => {
    pushUndo(get());
    set(state => ({
      timeline: {
        ...state.timeline,
        totalWeeks: Math.max(4, state.timeline.totalWeeks - weeks),
      },
    }));
    get().saveToStorage();
  },

  setTimelineConfig: (config) => {
    set(state => ({
      timeline: { ...state.timeline, ...config },
    }));
  },

  // === Drag (snapshot once per drag gesture) ===
  beginDrag: () => {
    pushUndo(get());
  },
  setDragIndicator: (week) => set({ dragIndicatorWeek: week }),

  // === Zoom ===
  zoomIn: () => {
    set(state => ({
      timeline: { ...state.timeline, weekWidthPx: Math.min(72, state.timeline.weekWidthPx + 6) },
    }));
  },
  zoomOut: () => {
    set(state => ({
      timeline: { ...state.timeline, weekWidthPx: Math.max(18, state.timeline.weekWidthPx - 6) },
    }));
  },
  zoomReset: () => {
    set(state => ({
      timeline: { ...state.timeline, weekWidthPx: 36 },
    }));
  },

  // === Selection ===
  // === Quick-add ===
  quickAddPhaseBar: (swimlaneId, startWeek, durationWeeks) => {
    pushUndo(get());
    const newId = uid();
    const state = get();
    const phaseType = state.lastUsedPhaseType;
    const def = getPhaseDef(phaseType, state.phaseTypes);
    set(s => ({
      phaseBars: [...s.phaseBars, {
        id: newId,
        swimlaneId,
        phaseType,
        label: def.label,
        startWeek: Math.max(0, startWeek),
        durationWeeks: Math.max(1 / 7, durationWeeks),
        environmentId: null,
        assigneeIds: [],
        teamIds: [],
      }],
      selectedBarId: newId,
      creatingBarId: newId,
    }));
    get().saveToStorage();
    return newId;
  },

  clearCreatingBar: () => set({ creatingBarId: null }),
  setSpaceHeld: (held) => set({ isSpaceHeld: held }),

  // === Selection ===
  selectBar: (id) => set({ selectedBarId: id, creatingBarId: null }),

  // === Action items ===
  addActionItem: (text, swimlaneId) => {
    pushUndo(get());
    set(state => ({
      actionItems: [...state.actionItems, {
        id: uid(),
        text,
        owner: '',
        done: false,
        swimlaneId: swimlaneId ?? null,
        createdAt: new Date().toISOString(),
      }],
    }));
    get().saveToStorage();
  },

  updateActionItem: (id, updates) => {
    pushUndo(get());
    set(state => ({
      actionItems: state.actionItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
    get().saveToStorage();
  },

  removeActionItem: (id) => {
    pushUndo(get());
    set(state => ({
      actionItems: state.actionItems.filter(item => item.id !== id),
    }));
    get().saveToStorage();
  },

  clearDoneActionItems: () => {
    pushUndo(get());
    set(state => ({
      actionItems: state.actionItems.filter(item => !item.done),
    }));
    get().saveToStorage();
  },

  // === Floating notes ===
  addFloatingNote: (x, y) => {
    pushUndo(get());
    const id = uid();
    // Pick the next color in rotation so consecutive notes don't collide.
    const idx = get().floatingNotes.length % FLOATING_NOTE_COLORS.length;
    const note: FloatingNote = {
      id,
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: FLOATING_NOTE_DEFAULT_WIDTH,
      height: FLOATING_NOTE_DEFAULT_HEIGHT,
      text: '',
      color: FLOATING_NOTE_COLORS[idx],
    };
    set(state => ({ floatingNotes: [...state.floatingNotes, note] }));
    get().saveToStorage();
    return id;
  },

  updateFloatingNote: (id, updates) => {
    pushUndo(get());
    set(state => ({
      floatingNotes: state.floatingNotes.map(n => (n.id === id ? { ...n, ...updates } : n)),
    }));
    get().saveToStorage();
  },

  // Per-frame drag/resize — skip undo and saveToStorage so the gesture stays
  // smooth. beginFloatingNoteDrag snapshots once at gesture start and the
  // pointerup handler triggers a single saveToStorage.
  moveFloatingNote: (id, x, y) => {
    set(state => ({
      floatingNotes: state.floatingNotes.map(n =>
        n.id === id ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n
      ),
    }));
  },

  resizeFloatingNote: (id, width, height) => {
    set(state => ({
      floatingNotes: state.floatingNotes.map(n =>
        n.id === id
          ? {
              ...n,
              width: Math.max(FLOATING_NOTE_MIN_WIDTH, width),
              height: Math.max(FLOATING_NOTE_MIN_HEIGHT, height),
            }
          : n
      ),
    }));
  },

  removeFloatingNote: (id) => {
    pushUndo(get());
    set(state => ({ floatingNotes: state.floatingNotes.filter(n => n.id !== id) }));
    get().saveToStorage();
  },

  beginFloatingNoteDrag: () => {
    pushUndo(get());
  },

  // === Notes panel ===
  toggleNotesPanel: () => set(state => ({
    notesPanelOpen: !state.notesPanelOpen,
    notesPanelSwimlaneId: null,
    notesPanelFilterId: state.notesPanelOpen ? null : state.notesPanelFilterId,
  })),

  openNotesPanelForSwimlane: (swimlaneId) => set({
    notesPanelOpen: true,
    notesPanelSwimlaneId: swimlaneId,
    notesPanelFilterId: null,
  }),

  openNotesPanelFiltered: (swimlaneId) => set({
    notesPanelOpen: true,
    notesPanelFilterId: swimlaneId,
    notesPanelSwimlaneId: swimlaneId,
  }),

  setNotesPanelFilter: (id) => set({ notesPanelFilterId: id }),

  clearNotesPanelFilter: () => set({ notesPanelFilterId: null }),

  // === Environments ===
  addEnvironment: (name, color) => {
    pushUndo(get());
    const id = uid();
    const env: Environment = {
      id,
      name: name.trim() || `ENV${get().environments.length + 1}`,
      color: color ?? pickNextEnvColor(get().environments, ENV_COLOR_PRESETS),
      order: get().environments.length,
      exclusive: true,
    };
    set(state => ({ environments: [...state.environments, env] }));
    get().saveToStorage();
    return id;
  },

  updateEnvironment: (id, updates) => {
    pushUndo(get());
    set(state => ({
      environments: state.environments.map(e => (e.id === id ? { ...e, ...updates } : e)),
    }));
    get().saveToStorage();
  },

  removeEnvironment: (id) => {
    pushUndo(get());
    set(state => ({
      environments: state.environments
        .filter(e => e.id !== id)
        .map((e, i) => ({ ...e, order: i })),
      // Unassign any bars that pointed at this env so they stop registering contention.
      phaseBars: state.phaseBars.map(b =>
        b.environmentId === id ? { ...b, environmentId: null } : b
      ),
      environmentFocusId: state.environmentFocusId === id ? null : state.environmentFocusId,
    }));
    get().saveToStorage();
  },

  reorderEnvironments: (orderedIds) => {
    pushUndo(get());
    const byId = new Map(get().environments.map(e => [e.id, e]));
    const next: Environment[] = [];
    orderedIds.forEach((id, i) => {
      const e = byId.get(id);
      if (e) next.push({ ...e, order: i });
    });
    set({ environments: next });
    get().saveToStorage();
  },

  setEnvironmentExclusive: (envId, exclusive) => {
    pushUndo(get());
    set(state => ({
      environments: state.environments.map(e =>
        e.id === envId ? { ...e, exclusive } : e
      ),
    }));
    get().saveToStorage();
  },

  setBarEnvironment: (barId, envId) => {
    pushUndo(get());
    const knownIds = new Set(get().environments.map(e => e.id));
    const safeEnvId = envId && knownIds.has(envId) ? envId : null;
    set(state => ({
      phaseBars: state.phaseBars.map(b =>
        b.id === barId ? { ...b, environmentId: safeEnvId } : b
      ),
    }));
    get().saveToStorage();
  },

  toggleEnvironmentsPanel: () => set(state => ({
    environmentsPanelOpen: !state.environmentsPanelOpen,
  })),

  setEnvironmentFocus: (envId) => set({ environmentFocusId: envId }),

  setHoveredBar: (id) => set({ hoveredBarId: id }),

  // === People & teams ===
  addTeam: (name, color) => {
    pushUndo(get());
    const id = uid();
    const team: Team = {
      id,
      name: name.trim() || `Team ${get().teams.length + 1}`,
      color: color ?? pickNextEnvColor([...get().teams, ...get().people], PEOPLE_COLOR_PRESETS),
      order: get().teams.length,
    };
    set(state => ({ teams: [...state.teams, team] }));
    get().saveToStorage();
    return id;
  },

  updateTeam: (id, updates) => {
    pushUndo(get());
    set(state => ({
      teams: state.teams.map(t => (t.id === id ? { ...t, ...updates } : t)),
    }));
    get().saveToStorage();
  },

  removeTeam: (id) => {
    pushUndo(get());
    set(state => ({
      teams: state.teams
        .filter(t => t.id !== id)
        .map((t, i) => ({ ...t, order: i })),
      // Un-team members; the people themselves remain.
      people: state.people.map(p => (p.teamId === id ? { ...p, teamId: null } : p)),
      // Unassign from bar allocations and swimlane ownership.
      phaseBars: state.phaseBars.map(b =>
        b.teamIds.includes(id) ? { ...b, teamIds: b.teamIds.filter(t => t !== id) } : b
      ),
      swimlanes: state.swimlanes.map(s =>
        s.teamIds.includes(id) ? { ...s, teamIds: s.teamIds.filter(t => t !== id) } : s
      ),
      peopleFocus: state.peopleFocus?.kind === 'team' && state.peopleFocus.id === id
        ? null : state.peopleFocus,
    }));
    get().saveToStorage();
  },

  addPerson: (name, opts) => {
    pushUndo(get());
    const id = uid();
    const person: Person = {
      id,
      name: name.trim() || `Person ${get().people.length + 1}`,
      ...(opts?.role?.trim() ? { role: opts.role.trim() } : {}),
      color: opts?.color ?? pickNextEnvColor([...get().teams, ...get().people], PEOPLE_COLOR_PRESETS),
      order: get().people.length,
      teamId: opts?.teamId ?? null,
    };
    set(state => ({ people: [...state.people, person] }));
    get().saveToStorage();
    return id;
  },

  updatePerson: (id, updates) => {
    pushUndo(get());
    set(state => ({
      people: state.people.map(p => (p.id === id ? { ...p, ...updates } : p)),
    }));
    get().saveToStorage();
  },

  removePerson: (id) => {
    pushUndo(get());
    set(state => ({
      people: state.people
        .filter(p => p.id !== id)
        .map((p, i) => ({ ...p, order: i })),
      phaseBars: state.phaseBars.map(b =>
        b.assigneeIds.includes(id) ? { ...b, assigneeIds: b.assigneeIds.filter(a => a !== id) } : b
      ),
      swimlanes: state.swimlanes.map(s =>
        s.assigneeIds.includes(id) ? { ...s, assigneeIds: s.assigneeIds.filter(a => a !== id) } : s
      ),
      peopleFocus: state.peopleFocus?.kind === 'person' && state.peopleFocus.id === id
        ? null : state.peopleFocus,
    }));
    get().saveToStorage();
  },

  setBarPeople: (barId, allocation) => {
    pushUndo(get());
    const knownPeople = new Set(get().people.map(p => p.id));
    const knownTeams = new Set(get().teams.map(t => t.id));
    set(state => ({
      phaseBars: state.phaseBars.map(b => {
        if (b.id !== barId) return b;
        return {
          ...b,
          assigneeIds: (allocation.assigneeIds ?? b.assigneeIds).filter(id => knownPeople.has(id)),
          teamIds: (allocation.teamIds ?? b.teamIds).filter(id => knownTeams.has(id)),
        };
      }),
    }));
    get().saveToStorage();
  },

  setSwimlaneOwners: (laneId, owners) => {
    pushUndo(get());
    const knownPeople = new Set(get().people.map(p => p.id));
    const knownTeams = new Set(get().teams.map(t => t.id));
    set(state => ({
      swimlanes: state.swimlanes.map(s => {
        if (s.id !== laneId) return s;
        return {
          ...s,
          assigneeIds: (owners.assigneeIds ?? s.assigneeIds).filter(id => knownPeople.has(id)),
          teamIds: (owners.teamIds ?? s.teamIds).filter(id => knownTeams.has(id)),
        };
      }),
    }));
    get().saveToStorage();
  },

  importPeopleFromJSON: (json) => {
    try {
      const data = JSON.parse(json);
      const incomingTeams = migrateTeams(data.teams);
      const incomingPeople = migratePeople(data.people);
      if (incomingTeams.length === 0 && incomingPeople.length === 0) {
        return { people: 0, teams: 0 };
      }
      pushUndo(get());
      const state = get();
      const haveTeam = new Set(state.teams.map(t => t.id));
      const havePerson = new Set(state.people.map(p => p.id));
      const newTeams = incomingTeams.filter(t => !haveTeam.has(t.id));
      const teamIdsAfter = new Set([...haveTeam, ...newTeams.map(t => t.id)]);
      const newPeople = incomingPeople
        .filter(p => !havePerson.has(p.id))
        // Drop dangling team refs the merge didn't bring along.
        .map(p => (p.teamId && !teamIdsAfter.has(p.teamId) ? { ...p, teamId: null } : p));
      set({
        teams: [...state.teams, ...newTeams].map((t, i) => ({ ...t, order: i })),
        people: [...state.people, ...newPeople].map((p, i) => ({ ...p, order: i })),
      });
      get().saveToStorage();
      return { people: newPeople.length, teams: newTeams.length };
    } catch {
      return null;
    }
  },

  togglePeoplePanel: () => set(state => ({
    peoplePanelOpen: !state.peoplePanelOpen,
  })),

  setPeopleFocus: (focus) => set({ peopleFocus: focus }),

  // === Phase types ===
  addPhaseType: (name, baseColor) => {
    pushUndo(get());
    const id = uid();
    const fill = baseColor ?? '#cccccc';
    const scheme = deriveColorScheme(fill);
    const displayName = (name?.trim() || `Type ${get().phaseTypes.length + 1}`);
    const def: PhaseTypeDef = {
      id,
      name: displayName,
      label: displayName.toUpperCase(),
      fill: scheme.fill,
      stroke: scheme.stroke,
      text: scheme.text,
      order: get().phaseTypes.length,
    };
    set(state => ({ phaseTypes: [...state.phaseTypes, def] }));
    get().saveToStorage();
    return id;
  },

  updatePhaseType: (id, updates) => {
    pushUndo(get());
    set(state => ({
      phaseTypes: state.phaseTypes.map(t => (t.id === id ? { ...t, ...updates } : t)),
    }));
    get().saveToStorage();
  },

  removePhaseType: (id) => {
    // Reassign any bars using this type to the first remaining type, or
    // 'custom' as a last resort. Caller should confirm-on-in-use upstream.
    const state = get();
    if (state.phaseTypes.length <= 1) return; // never let the list go empty
    pushUndo(state);
    const remaining = state.phaseTypes.filter(t => t.id !== id);
    const fallbackId = remaining[0].id;
    set({
      phaseTypes: remaining.map((t, i) => ({ ...t, order: i })),
      phaseBars: state.phaseBars.map(b =>
        b.phaseType === id ? { ...b, phaseType: fallbackId } : b
      ),
      lastUsedPhaseType: state.lastUsedPhaseType === id ? fallbackId : state.lastUsedPhaseType,
    });
    get().saveToStorage();
  },

  reorderPhaseTypes: (orderedIds) => {
    pushUndo(get());
    const byId = new Map(get().phaseTypes.map(t => [t.id, t]));
    const next: PhaseTypeDef[] = [];
    orderedIds.forEach((id, i) => {
      const t = byId.get(id);
      if (t) next.push({ ...t, order: i });
    });
    set({ phaseTypes: next });
    get().saveToStorage();
  },

  togglePhaseTypesModal: () => set(state => ({
    phaseTypesModalOpen: !state.phaseTypesModalOpen,
  })),

  resetPhaseTypesToBuiltins: () => {
    pushUndo(get());
    set({ phaseTypes: getBuiltinPhaseTypes() });
    get().saveToStorage();
  },

  syncBuiltinPhaseColorsToTheme: (theme) => {
    const refreshed = applyThemePresetsToBuiltins(get().phaseTypes, theme);
    // Only update if something actually changed, to avoid needless renders.
    const changed = refreshed.some((t, i) => {
      const prev = get().phaseTypes[i];
      return !prev || t.fill !== prev.fill || t.stroke !== prev.stroke || t.text !== prev.text;
    });
    if (changed) set({ phaseTypes: refreshed });
  },

  // === UI preferences ===
  toggleMonthDates: () => {
    set(state => ({ showMonthDates: !state.showMonthDates }));
    get().saveToStorage();
  },

  toggleBarDates: () => {
    set(state => ({ showBarDates: !state.showBarDates }));
    get().saveToStorage();
  },

  toggleWeekends: () => {
    set(state => ({ showWeekends: !state.showWeekends }));
    get().saveToStorage();
  },

  toggleHolidays: () => {
    set(state => ({ showHolidays: !state.showHolidays }));
    get().saveToStorage();
  },

  toggleMilestones: () => {
    set(state => ({ showMilestones: !state.showMilestones }));
    get().saveToStorage();
  },

  toggleEnvIndicators: () => {
    set(state => ({ showEnvIndicators: !state.showEnvIndicators }));
    get().saveToStorage();
  },

  toggleEnvMarquees: () => {
    set(state => ({ showEnvMarquees: !state.showEnvMarquees }));
    get().saveToStorage();
  },

  toggleContention: () => {
    set(state => ({ showContention: !state.showContention }));
    get().saveToStorage();
  },

  togglePeopleIndicators: () => {
    set(state => ({ showPeopleIndicators: !state.showPeopleIndicators }));
    get().saveToStorage();
  },

  togglePeopleContention: () => {
    set(state => ({ showPeopleContention: !state.showPeopleContention }));
    get().saveToStorage();
  },

  setBarStyle: (style) => {
    set({ barStyle: style });
    get().saveToStorage();
  },

  // === Persistence ===
  saveToStorage: () => {
    try {
      const state = get();
      const data = {
        sections: state.sections,
        swimlanes: state.swimlanes,
        phaseBars: state.phaseBars,
        milestones: state.milestones,
        dependencies: state.dependencies,
        actionItems: state.actionItems,
        floatingNotes: state.floatingNotes,
        environments: state.environments,
        teams: state.teams,
        people: state.people,
        phaseTypes: state.phaseTypes,
        timeline: state.timeline,
        showMonthDates: state.showMonthDates,
        showBarDates: state.showBarDates,
        showWeekends: state.showWeekends,
        showHolidays: state.showHolidays,
        showMilestones: state.showMilestones,
        showEnvIndicators: state.showEnvIndicators,
        showEnvMarquees: state.showEnvMarquees,
        showContention: state.showContention,
        showPeopleIndicators: state.showPeopleIndicators,
        showPeopleContention: state.showPeopleContention,
        barStyle: state.barStyle,
        calendarModelVersion: SCHEMA_VERSION,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore storage errors */ }
    // Any call to saveToStorage represents a mutation (auto-persisted),
    // so mark the session dirty. Callers that just loaded state from
    // disk/file/localStorage override this with set({ isDirty: false }).
    set({ isDirty: true });
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        ensureTodayVisible(get, set);
        set({ isDirty: false });
        return false;
      }
      const data = JSON.parse(raw);
      const savedTimeline = data.timeline || defaultState.timeline;

      // Migrate: clear old 4-week-per-month data or pre-2026 data
      if (savedTimeline.startYear < 2026 || !data.calendarModelVersion || data.calendarModelVersion < 2) {
        localStorage.removeItem(STORAGE_KEY);
        ensureTodayVisible(get, set);
        set({ isDirty: false });
        return false;
      }

      set({
        sections: data.sections || DEFAULT_SECTIONS,
        swimlanes: migrateSwimlanes(data.swimlanes),
        phaseBars: migratePhaseBars(data.phaseBars),
        milestones: data.milestones || [],
        dependencies: data.dependencies || [],
        actionItems: data.actionItems || [],
        floatingNotes: Array.isArray(data.floatingNotes) ? data.floatingNotes : [],
        environments: migrateEnvironments(data.environments),
        teams: migrateTeams(data.teams),
        people: migratePeople(data.people),
        phaseTypes: migratePhaseTypes(data.phaseTypes),
        timeline: savedTimeline,
        showMonthDates: data.showMonthDates ?? false,
        showBarDates: data.showBarDates ?? false,
        showWeekends: data.showWeekends ?? true,
        showHolidays: data.showHolidays ?? true,
        showMilestones: data.showMilestones ?? true,
        showEnvIndicators: data.showEnvIndicators ?? true,
        showEnvMarquees: data.showEnvMarquees ?? true,
        showContention: data.showContention ?? true,
        showPeopleIndicators: data.showPeopleIndicators ?? true,
        showPeopleContention: data.showPeopleContention ?? true,
        barStyle: data.barStyle === 'legacy' ? 'legacy' : 'tagged',
      });
      ensureTodayVisible(get, set);
      // Restored state matches localStorage — from the user's POV nothing
      // has changed "since last action". First edit flips dirty on.
      set({ isDirty: false });
      return true;
    } catch {
      return false;
    }
  },

  exportToJSON: () => {
    const state = get();
    return JSON.stringify({
      sections: state.sections,
      swimlanes: state.swimlanes,
      phaseBars: state.phaseBars,
      milestones: state.milestones,
      dependencies: state.dependencies,
      actionItems: state.actionItems,
      floatingNotes: state.floatingNotes,
      environments: state.environments,
      teams: state.teams,
      people: state.people,
      phaseTypes: state.phaseTypes,
      timeline: state.timeline,
      // View preferences — so reimporting restores the user's toggles
      showMonthDates: state.showMonthDates,
      showBarDates: state.showBarDates,
      showWeekends: state.showWeekends,
      showHolidays: state.showHolidays,
      showMilestones: state.showMilestones,
      showEnvIndicators: state.showEnvIndicators,
      showEnvMarquees: state.showEnvMarquees,
      showContention: state.showContention,
      showPeopleIndicators: state.showPeopleIndicators,
      showPeopleContention: state.showPeopleContention,
      barStyle: state.barStyle,
      // Save attribution. When signed in this is the real Microsoft account
      // (name + object id); signed out it falls back to the self-declared
      // local display name, which is provenance only, not authentication.
      meta: currentSaveIdentity(),
      // Format marker (so downstream loaders can detect legacy data)
      calendarModelVersion: SCHEMA_VERSION,
    }, null, 2);
  },

  importFromJSON: (json) => {
    try {
      const data = JSON.parse(json);
      // Validate required structure
      if (!Array.isArray(data.swimlanes) || !Array.isArray(data.phaseBars)) {
        throw new Error('Invalid format: missing swimlanes or phaseBars arrays');
      }
      if (data.timeline && (typeof data.timeline.totalWeeks !== 'number' || typeof data.timeline.startYear !== 'number')) {
        throw new Error('Invalid format: timeline must have totalWeeks and startYear');
      }
      pushUndo(get());
      set({
        sections: data.sections || DEFAULT_SECTIONS,
        swimlanes: migrateSwimlanes(data.swimlanes),
        phaseBars: migratePhaseBars(data.phaseBars),
        milestones: data.milestones || [],
        dependencies: data.dependencies || [],
        actionItems: data.actionItems || [],
        floatingNotes: Array.isArray(data.floatingNotes) ? data.floatingNotes : [],
        environments: migrateEnvironments(data.environments),
        teams: migrateTeams(data.teams),
        people: migratePeople(data.people),
        phaseTypes: migratePhaseTypes(data.phaseTypes),
        timeline: data.timeline || defaultState.timeline,
        // Restore view preferences — fall back to current defaults if the
        // file predates a given flag.
        showMonthDates: data.showMonthDates ?? false,
        showBarDates: data.showBarDates ?? false,
        showWeekends: data.showWeekends ?? true,
        showHolidays: data.showHolidays ?? true,
        showMilestones: data.showMilestones ?? true,
        showEnvIndicators: data.showEnvIndicators ?? true,
        showEnvMarquees: data.showEnvMarquees ?? true,
        showContention: data.showContention ?? true,
        showPeopleIndicators: data.showPeopleIndicators ?? true,
        showPeopleContention: data.showPeopleContention ?? true,
        barStyle: data.barStyle === 'legacy' ? 'legacy' : 'tagged',
      });
      get().saveToStorage();
      // State now matches the imported file; clear the dirty flag that
      // saveToStorage just set. openFile() sets currentFileName/Handle
      // on top of this. Capture the file's save-attribution meta if present.
      set({
        isDirty: false,
        fileMeta: {
          savedBy: typeof data?.meta?.savedBy === 'string' ? data.meta.savedBy : null,
          savedById: typeof data?.meta?.savedById === 'string' ? data.meta.savedById : null,
          savedAtIso: typeof data?.meta?.savedAtIso === 'string' ? data.meta.savedAtIso : null,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Import failed: ${msg}`);
    }
  },

  saveFile: async (opts) => {
    const { planSource, exportToJSON, saveFileAs, baseline } = get();
    if (!planSource) {
      return saveFileAs();
    }
    try {
      // Flush any pending contentEditable edits before snapshotting state.
      (document.activeElement as HTMLElement | null)?.blur();

      // ── Microsoft 365 ────────────────────────────────────────────────
      if (planSource.kind === 'graph') {
        const json = exportToJSON();
        // If-Match carries our baseline eTag so the server rejects the write
        // when someone else saved first. `force` (from the conflict dialog)
        // drops the header and overwrites deliberately.
        const guardTag = opts?.force ? null
          : baseline?.kind === 'graph' ? baseline.eTag : null;
        try {
          const { eTag } = await graph.uploadPlan(planSource.driveId, planSource.itemId, json, guardTag);
          set({
            isDirty: false,
            fileMeta: parseFileMeta(json),
            baseline: { kind: 'graph', eTag },
            saveConflict: null,
            externalUpdate: null,
            externalUpdateDismissedMarker: null,
          });
          return true;
        } catch (e) {
          if (e instanceof GraphConflictError) {
            set({
              saveConflict: {
                savedBy: e.meta.lastModifiedBy,
                savedById: null,
                savedAtIso: e.meta.lastModifiedIso || null,
              },
            });
            return false;
          }
          throw e;
        }
      }

      // ── Local file ───────────────────────────────────────────────────
      // Overwrite guard: if the file on disk is newer than the version this
      // session opened/last saved, someone else saved in between — surface
      // the conflict dialog instead of silently clobbering their work.
      if (!opts?.force && baseline?.kind === 'local') {
        const diskMs = await getFileLastModified(planSource.handle);
        if (diskMs > baseline.lastModifiedMs) {
          const diskMeta = parseFileMeta(await readFileAsText(planSource.handle));
          set({ saveConflict: diskMeta });
          return false;
        }
      }

      const json = exportToJSON();
      await writeFileText(planSource.handle, json);
      const newBaseline = await getFileLastModified(planSource.handle);
      set({
        isDirty: false,
        fileMeta: parseFileMeta(json),
        baseline: { kind: 'local', lastModifiedMs: newBaseline },
        saveConflict: null,
        externalUpdate: null,
        externalUpdateDismissedMarker: null,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Save failed: ${msg}`);
      return false;
    }
  },

  saveFileAs: async () => {
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      const suggested = get().currentFileName || 'roadmap.json';
      if (!isFileSystemAccessSupported()) {
        // Fallback (Firefox/Safari): download a copy. No handle to save back
        // to later, but the payload is identical.
        const json = get().exportToJSON();
        downloadTextFile(suggested, json);
        set({ currentFileName: suggested, isDirty: false, fileMeta: parseFileMeta(json) });
        return true;
      }
      const handle = await pickSaveFile(suggested);
      if (!handle) return false; // user cancelled
      const json = get().exportToJSON();
      await writeFileText(handle, json);
      const lastModifiedMs = await getFileLastModified(handle);
      set({
        planSource: { kind: 'local', handle },
        currentFileName: handle.name,
        isDirty: false,
        fileMeta: parseFileMeta(json),
        baseline: { kind: 'local', lastModifiedMs },
        saveConflict: null,
        externalUpdate: null,
        externalUpdateDismissedMarker: null,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Save As failed: ${msg}`);
      return false;
    }
  },

  openFile: async () => {
    if (get().isDirty && !window.confirm('Discard unsaved changes?')) {
      return false;
    }
    try {
      if (!isFileSystemAccessSupported()) {
        // Fallback (Firefox/Safari): upload via file input. No handle, so a
        // later Save falls back to a download.
        const picked = await pickUploadFile();
        if (!picked) return false; // user cancelled
        get().importFromJSON(picked.text);
        set({
          planSource: null,
          currentFileName: picked.name,
          isDirty: false,
          baseline: null,
          saveConflict: null,
          externalUpdate: null,
          externalUpdateDismissedMarker: null,
          appView: 'plan',
        });
        return true;
      }
      const handle = await pickOpenFile();
      if (!handle) return false; // user cancelled
      const text = await readFileAsText(handle);
      const lastModifiedMs = await getFileLastModified(handle);
      // importFromJSON handles parse, validation, migration, and clears
      // isDirty at the end. Then we layer on the file identity.
      get().importFromJSON(text);
      set({
        planSource: { kind: 'local', handle },
        currentFileName: handle.name,
        isDirty: false,
        baseline: { kind: 'local', lastModifiedMs },
        saveConflict: null,
        externalUpdate: null,
        externalUpdateDismissedMarker: null,
        appView: 'plan',
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Open failed: ${msg}`);
      return false;
    }
  },

  newFile: () => {
    if (get().isDirty && !window.confirm('Discard unsaved changes?')) return;
    pushUndo(get());
    // Reset to seed data exactly as a cold start would — but without the
    // localStorage round-trip. We do overwrite localStorage after so a
    // subsequent refresh lands on this same blank slate instead of
    // restoring the old document.
    set({
      ...defaultState,
      currentFileName: null,
      planSource: null,
      isDirty: false,
      fileMeta: null,
      baseline: null,
      saveConflict: null,
      externalUpdate: null,
      externalUpdateDismissedMarker: null,
      appView: get().appView,
    });
    ensureTodayVisible(get, set);
    get().saveToStorage();
    // saveToStorage flipped dirty on; "New" is a clean starting point.
    set({ isDirty: false });
  },

  checkFileFreshness: async () => {
    const { planSource, baseline, externalUpdateDismissedMarker } = get();
    if (!planSource || !baseline) return;
    try {
      // Ask the source for its current version + who last touched it.
      let marker: PlanMarker;
      let meta: FileMeta;
      if (planSource.kind === 'graph') {
        const itemMeta = await graph.getItemMeta(planSource.driveId, planSource.itemId);
        marker = itemMeta.eTag;
        meta = { savedBy: itemMeta.lastModifiedBy, savedById: null, savedAtIso: itemMeta.lastModifiedIso || null };
        if (baseline.kind !== 'graph' || itemMeta.eTag === baseline.eTag) {
          if (get().externalUpdate) set({ externalUpdate: null });
          return;
        }
      } else {
        const diskMs = await getFileLastModified(planSource.handle);
        if (baseline.kind !== 'local' || diskMs <= baseline.lastModifiedMs) {
          // Source matches (or predates) what we have — clear any stale banner.
          if (get().externalUpdate) set({ externalUpdate: null });
          return;
        }
        marker = diskMs;
        meta = parseFileMeta(await readFileAsText(planSource.handle));
      }

      // Someone saved after us. Respect a "Keep mine" dismissal until an
      // even newer save shows up.
      if (externalUpdateDismissedMarker !== null && externalUpdateDismissedMarker === marker) return;
      if (
        typeof marker === 'number' && typeof externalUpdateDismissedMarker === 'number'
        && marker <= externalUpdateDismissedMarker
      ) return;

      set({ externalUpdate: { ...meta, marker } });
    } catch {
      // Transient failures (file locked mid-sync, a blip talking to Graph)
      // are ignored — the next poll retries.
    }
  },

  reloadFromDisk: async () => {
    const { planSource } = get();
    if (!planSource) return false;
    try {
      if (planSource.kind === 'graph') {
        const { text, eTag } = await graph.downloadPlan(planSource.driveId, planSource.itemId);
        get().importFromJSON(text);
        set({
          isDirty: false,
          baseline: { kind: 'graph', eTag },
          externalUpdate: null,
          externalUpdateDismissedMarker: null,
          saveConflict: null,
        });
        return true;
      }
      const text = await readFileAsText(planSource.handle);
      const lastModifiedMs = await getFileLastModified(planSource.handle);
      get().importFromJSON(text);
      set({
        isDirty: false,
        baseline: { kind: 'local', lastModifiedMs },
        externalUpdate: null,
        externalUpdateDismissedMarker: null,
        saveConflict: null,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Reload failed: ${msg}`);
      return false;
    }
  },

  dismissExternalUpdate: () => {
    const { externalUpdate } = get();
    if (!externalUpdate) return;
    set({ externalUpdateDismissedMarker: externalUpdate.marker, externalUpdate: null });
  },

  clearSaveConflict: () => set({ saveConflict: null }),

  // === Microsoft 365 plans ===
  openGraphPlan: async (file) => {
    if (get().isDirty && !window.confirm('Discard unsaved changes?')) return false;
    try {
      const { text, eTag } = await graph.downloadPlan(file.driveId, file.itemId);
      get().importFromJSON(text);
      const source: PlanSource = {
        kind: 'graph',
        driveId: file.driveId,
        itemId: file.itemId,
        name: file.name,
        webUrl: file.webUrl,
        container: file.container,
      };
      set({
        planSource: source,
        currentFileName: file.name,
        isDirty: false,
        baseline: { kind: 'graph', eTag },
        saveConflict: null,
        externalUpdate: null,
        externalUpdateDismissedMarker: null,
        appView: 'plan',
      });
      rememberPlan(source);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Could not open plan: ${msg}`);
      return false;
    }
  },

  createGraphPlan: async (container, name) => {
    try {
      const folder = container.type === 'team'
        ? await graph.ensureRoadmapsFolder(container.teamId)
        : await graph.getDraftsFolder();

      // Start from a blank document so the new plan isn't a copy of whatever
      // happened to be open.
      set({ ...defaultState, currentFileName: null, planSource: null, appView: get().appView });
      ensureTodayVisible(get, set);

      const created = await graph.createPlan(folder, name, get().exportToJSON());
      const source: PlanSource = {
        kind: 'graph',
        driveId: created.driveId,
        itemId: created.itemId,
        name: created.name,
        webUrl: created.webUrl,
        container,
      };
      set({
        planSource: source,
        currentFileName: created.name,
        isDirty: false,
        fileMeta: parseFileMeta(get().exportToJSON()),
        baseline: { kind: 'graph', eTag: created.eTag },
        saveConflict: null,
        externalUpdate: null,
        externalUpdateDismissedMarker: null,
        appView: 'plan',
      });
      rememberPlan(source);
      get().saveToStorage();
      set({ isDirty: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Could not create plan: ${msg}`);
      return false;
    }
  },

  setAppView: (view) => set({ appView: view }),

  // === History ===
  undo: () => {
    if (undoStack.length === 0) return;
    redoStack.push(snapshot(get()));
    const prev = undoStack.pop()!;
    set(prev);
    get().saveToStorage();
  },

  redo: () => {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot(get()));
    const next = redoStack.pop()!;
    set(next);
    get().saveToStorage();
  },

  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,
}));

// Dev-only: expose the store for browser-automation testing (never in builds).
if (import.meta.env.DEV) {
  (window as unknown as { __ganttStore?: typeof useGanttStore }).__ganttStore = useGanttStore;
}
