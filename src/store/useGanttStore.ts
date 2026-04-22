import { create } from 'zustand';
import type {
  GanttState,
  Swimlane,
  PhaseBar,
  ActionItem,
  TimelineConfig,
  SwimlaneSection,
  Section,
} from '../types/gantt';
import { DEFAULT_SECTIONS } from '../types/gantt';
import { PHASE_PRESETS } from '../data/phasePresets';
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

  // UI preferences
  toggleMonthDates: () => void;
  toggleBarDates: () => void;
  toggleWeekends: () => void;
  toggleHolidays: () => void;
  toggleMilestones: () => void;

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
  lastUsedPhaseType: 'development',
  creatingBarId: null,
  isSpaceHeld: false,
  notesPanelOpen: false,
  notesPanelSwimlaneId: null,
  notesPanelFilterId: null,
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
    timeline: state.timeline,
    selectedBarId: state.selectedBarId,
  }));
}

function pushUndo(state: GanttState) {
  undoStack.push(snapshot(state));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

/** Migrate legacy keyFeatures: string[] → HTML string. Idempotent on strings. */
function migrateSwimlanes(swimlanes: unknown): Swimlane[] {
  if (!Array.isArray(swimlanes)) return [];
  return swimlanes.map(raw => {
    const s = raw as Swimlane & { keyFeatures: string | string[] };
    if (Array.isArray(s.keyFeatures)) {
      return { ...s, keyFeatures: featuresArrayToHtml(s.keyFeatures) };
    }
    return s as Swimlane;
  });
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
      phaseBars: [...state.phaseBars, { ...bar, id: uid() }],
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
    const phaseType = get().lastUsedPhaseType;
    const label = PHASE_PRESETS[phaseType].label;
    set(state => ({
      phaseBars: [...state.phaseBars, {
        id: newId,
        swimlaneId,
        phaseType,
        label,
        startWeek: Math.max(0, startWeek),
        durationWeeks: Math.max(1 / 7, durationWeeks),
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
        timeline: state.timeline,
        showMonthDates: state.showMonthDates,
        showBarDates: state.showBarDates,
        showWeekends: state.showWeekends,
        showHolidays: state.showHolidays,
        showMilestones: state.showMilestones,
        calendarModelVersion: 2,
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
        phaseBars: data.phaseBars || [],
        milestones: data.milestones || [],
        dependencies: data.dependencies || [],
        actionItems: data.actionItems || [],
        timeline: savedTimeline,
        showMonthDates: data.showMonthDates ?? false,
        showBarDates: data.showBarDates ?? false,
        showWeekends: data.showWeekends ?? true,
        showHolidays: data.showHolidays ?? true,
        showMilestones: data.showMilestones ?? true,
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
      timeline: state.timeline,
      // View preferences — so reimporting restores the user's toggles
      showMonthDates: state.showMonthDates,
      showBarDates: state.showBarDates,
      showWeekends: state.showWeekends,
      showHolidays: state.showHolidays,
      showMilestones: state.showMilestones,
      // Format marker (so downstream loaders can detect legacy data)
      calendarModelVersion: 2,
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
        phaseBars: data.phaseBars,
        milestones: data.milestones || [],
        dependencies: data.dependencies || [],
        actionItems: data.actionItems || [],
        timeline: data.timeline || defaultState.timeline,
        // Restore view preferences — fall back to current defaults if the
        // file predates a given flag.
        showMonthDates: data.showMonthDates ?? false,
        showBarDates: data.showBarDates ?? false,
        showWeekends: data.showWeekends ?? true,
        showHolidays: data.showHolidays ?? true,
        showMilestones: data.showMilestones ?? true,
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
