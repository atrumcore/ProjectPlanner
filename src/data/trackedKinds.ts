import type { TrackedKind } from '../types/gantt';

export interface KindMeta {
  /** Singular display name, e.g. in the kind picker. */
  label: string;
  /** Plural, used in filter options and counts. */
  plural: string;
  /** Short form for the row chip where space is tight. */
  short: string;
  /** CSS colour token for the row dot and filter swatch. */
  color: string;
  /** Past-tense word for `done`, per kind — an action is Completed, a
   * dependency Cleared, a risk Mitigated. Drives the list divider, the
   * clear-done footer and the checkbox tooltip. */
  doneLabel: string;
  /** One-line placeholder for the add row, so the kind explains itself. */
  hint: string;
}

/**
 * Everything that varies per kind, in one place — so no component ever
 * switches on the TrackedKind union. Adding a seventh kind means adding a
 * row here and nothing else.
 *
 * The six kinds are a complete RAID register (Risk, Assumption, Issue,
 * Dependency) plus the two the planner already needed (Action, Decision).
 */
export const KIND_META: Record<TrackedKind, KindMeta> = {
  action: {
    label: 'Action', plural: 'Actions', short: 'Action',
    color: 'var(--today-line)', doneLabel: 'Completed',
    hint: 'What needs doing?',
  },
  dependency: {
    label: 'Dependency', plural: 'Dependencies', short: 'Dep',
    color: 'var(--warning)', doneLabel: 'Cleared',
    hint: 'What are we waiting on?',
  },
  risk: {
    label: 'Risk', plural: 'Risks', short: 'Risk',
    color: 'var(--contention)', doneLabel: 'Mitigated',
    hint: 'What might go wrong?',
  },
  issue: {
    label: 'Issue', plural: 'Issues', short: 'Issue',
    color: 'var(--error-bright)', doneLabel: 'Resolved',
    hint: 'What has gone wrong?',
  },
  decision: {
    label: 'Decision', plural: 'Decisions', short: 'Decision',
    color: 'var(--accent-secondary)', doneLabel: 'Decided',
    hint: 'What needs deciding?',
  },
  assumption: {
    label: 'Assumption', plural: 'Assumptions', short: 'Assump',
    color: 'var(--text-muted)', doneLabel: 'Validated',
    hint: 'What are we assuming?',
  },
};

/** Picker/filter order — by how often each is used in a delivery plan,
 * not RAID's mnemonic order. */
export const KIND_ORDER: TrackedKind[] = [
  'action', 'dependency', 'risk', 'issue', 'decision', 'assumption',
];

/** Kinds that mean "this project is held up", used to tint the lane badge. */
export const BLOCKING_KINDS: TrackedKind[] = ['dependency', 'risk', 'issue'];

export function isTrackedKind(v: unknown): v is TrackedKind {
  return typeof v === 'string' && v in KIND_META;
}
