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
  PhaseTypeDef,
} from '../types/gantt';
// PhaseBar imported above; alias for the migration helper signature.
import { DEFAULT_SECTIONS, ENV_COLOR_PRESETS } from '../types/gantt';
import { pickNextEnvColor } from '../utils/contention';
import { BUILTIN_PHASE_TYPES, getPhaseDef, deriveColorScheme } from '../data/phasePresets';
import { getWeeksForMonth, getDaysInMonth } from '../utils/dateUtils';
import { featuresArrayToHtml } from '../utils/htmlSanitize';
import {
  isFileSystemAccessSupported,
  pickOpenFile,
  pickSaveFile,
  readFileAsText,
  writeFileText,
} from '../utils/fileSystemAccess';

const uid = () => crypto.randomUUID();

const STORAGE_KEY = 'dha-gantt-state';
const MAX_HISTORY = 50;

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

  // Phase types
  addPhaseType: (name?: string, baseColor?: string) => string;
  updatePhaseType: (id: string, updates: Partial<Omit<PhaseTypeDef, 'id'>>) => void;
  removePhaseType: (id: string) => void;
  reorderPhaseTypes: (orderedIds: string[]) => void;
  togglePhaseTypesModal: () => void;
  resetPhaseTypesToBuiltins: () => void;

  // UI preferences
  toggleMonthDates: () => void;
  toggleBarDates: () => void;
  toggleWeekends: () => void;
  toggleHolidays: () => void;
  toggleMilestones: () => void;
  toggleEnvIndicators: () => void;
  toggleEnvMarquees: () => void;
  toggleContention: () => void;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => boolean;
  exportToJSON: () => string;
  importFromJSON: (json: string) => void;

  // File operations (Chromium-only, File System Access API)
  saveFile: () => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
  openFile: () => Promise<boolean>;
  newFile: () => void;

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
  environments: [],
  phaseTypes: BUILTIN_PHASE_TYPES,
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
  lastUsedPhaseType: 'development',
  creatingBarId: null,
  isSpaceHeld: false,
  notesPanelOpen: false,
  notesPanelSwimlaneId: null,
  notesPanelFilterId: null,
  environmentsPanelOpen: false,
  environmentFocusId: null,
  hoveredBarId: null,
  phaseTypesModalOpen: false,
  currentFileName: null,
  currentFileHandle: null,
  isDirty: false,
};

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
    environments: state.environments,
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

/** Migrate legacy keyFeatures: string[] → HTML string. Strips the deprecated
 * environmentId field (v4 → v5). Idempotent. */
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
  const list = Array.isArray(types) && types.length > 0 ? types : BUILTIN_PHASE_TYPES;
  return list.map((raw: any) => ({
    id: raw.id,
    name: raw.name,
    label: raw.label,
    fill: raw.fill,
    stroke: raw.stroke,
    text: raw.text,
    order: raw.order,
  }));
}

/** v5 → v6: ensure every bar carries `environmentId` (null when missing). */
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
        { ...bar, id: uid(), environmentId: bar.environmentId ?? null },
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
      const weeksToAdd = getWeeksForMonth(newMonth, newYear);
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
      const weeksToRemove = getWeeksForMonth(state.timeline.startMonth, state.timeline.startYear);
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
    set({ phaseTypes: BUILTIN_PHASE_TYPES });
    get().saveToStorage();
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
        environments: state.environments,
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
        calendarModelVersion: 6,
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
        environments: migrateEnvironments(data.environments),
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
      environments: state.environments,
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
      // Format marker (so downstream loaders can detect legacy data)
      calendarModelVersion: 5,
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
        environments: migrateEnvironments(data.environments),
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
      });
      get().saveToStorage();
      // State now matches the imported file; clear the dirty flag that
      // saveToStorage just set. openFile() sets currentFileName/Handle
      // on top of this.
      set({ isDirty: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Import failed: ${msg}`);
    }
  },

  saveFile: async () => {
    const { currentFileHandle, exportToJSON, saveFileAs } = get();
    if (!currentFileHandle) {
      return saveFileAs();
    }
    try {
      // Flush any pending contentEditable edits before snapshotting state.
      (document.activeElement as HTMLElement | null)?.blur();
      await writeFileText(currentFileHandle, exportToJSON());
      set({ isDirty: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Save failed: ${msg}`);
      return false;
    }
  },

  saveFileAs: async () => {
    if (!isFileSystemAccessSupported()) {
      alert('Save As requires Chrome or Edge.');
      return false;
    }
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      const suggested = get().currentFileName || 'roadmap.json';
      const handle = await pickSaveFile(suggested);
      if (!handle) return false; // user cancelled
      await writeFileText(handle, get().exportToJSON());
      set({
        currentFileHandle: handle,
        currentFileName: handle.name,
        isDirty: false,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Save As failed: ${msg}`);
      return false;
    }
  },

  openFile: async () => {
    if (!isFileSystemAccessSupported()) {
      alert('Open requires Chrome or Edge.');
      return false;
    }
    if (get().isDirty && !window.confirm('Discard unsaved changes?')) {
      return false;
    }
    try {
      const handle = await pickOpenFile();
      if (!handle) return false; // user cancelled
      const text = await readFileAsText(handle);
      // importFromJSON handles parse, validation, migration, and clears
      // isDirty at the end. Then we layer on the file identity.
      get().importFromJSON(text);
      set({
        currentFileHandle: handle,
        currentFileName: handle.name,
        isDirty: false,
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
      currentFileHandle: null,
      isDirty: false,
    });
    ensureTodayVisible(get, set);
    get().saveToStorage();
    // saveToStorage flipped dirty on; "New" is a clean starting point.
    set({ isDirty: false });
  },

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
