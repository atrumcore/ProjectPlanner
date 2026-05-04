import type { Environment, GanttState, PhaseBar, PhaseType } from '../types/gantt';

export interface Contention {
  envId: string;
  barAId: string;
  barBId: string;
  swimlaneAId: string;
  swimlaneBId: string;
  phaseTypeA: PhaseType;
  phaseTypeB: PhaseType;
  weekRange: [number, number];
}

type ContentionInput = Pick<GanttState, 'environments' | 'swimlanes' | 'phaseBars'>;

function barsOverlapInTime(a: PhaseBar, b: PhaseBar): boolean {
  const aEnd = a.startWeek + a.durationWeeks;
  const bEnd = b.startWeek + b.durationWeeks;
  return a.startWeek < bEnd && b.startWeek < aEnd;
}

/** For each Exclusive env, find pairs of bars (different swimlanes) with
 * `bar.environmentId === env.id` that overlap in time. */
export function getContentions({ environments, phaseBars }: ContentionInput): Contention[] {
  if (environments.length === 0 || phaseBars.length === 0) return [];

  // Bucket bars by their assigned env.
  const barsByEnv = new Map<string, PhaseBar[]>();
  for (const bar of phaseBars) {
    if (!bar.environmentId) continue;
    let bucket = barsByEnv.get(bar.environmentId);
    if (!bucket) { bucket = []; barsByEnv.set(bar.environmentId, bucket); }
    bucket.push(bar);
  }

  const result: Contention[] = [];
  for (const env of environments) {
    if (!env.exclusive) continue; // Shared env never produces contention
    const bars = barsByEnv.get(env.id);
    if (!bars || bars.length < 2) continue;

    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i];
        const b = bars[j];
        if (a.swimlaneId === b.swimlaneId) continue; // same project's own staging
        if (!barsOverlapInTime(a, b)) continue;

        const start = Math.max(a.startWeek, b.startWeek);
        const end = Math.min(a.startWeek + a.durationWeeks, b.startWeek + b.durationWeeks);
        result.push({
          envId: env.id,
          barAId: a.id,
          barBId: b.id,
          swimlaneAId: a.swimlaneId,
          swimlaneBId: b.swimlaneId,
          phaseTypeA: a.phaseType,
          phaseTypeB: b.phaseType,
          weekRange: [start, end],
        });
      }
    }
  }
  return result;
}

/** Recompute contentions assuming `bar` were positioned at the supplied
 * (startWeek, durationWeeks). Used during drag for the live CLEAR/CONFLICT
 * pill — the in-store bar might already be moving but we want to evaluate
 * the latest *proposed* position. */
export function getContentionsForBar(
  bar: PhaseBar,
  state: ContentionInput,
): Contention[] {
  if (!bar.environmentId) return [];
  const env = state.environments.find(e => e.id === bar.environmentId);
  if (!env || !env.exclusive) return [];

  const out: Contention[] = [];
  for (const other of state.phaseBars) {
    if (other.id === bar.id) continue;
    if (other.swimlaneId === bar.swimlaneId) continue;
    if (other.environmentId !== env.id) continue;
    if (!barsOverlapInTime(bar, other)) continue;

    const start = Math.max(bar.startWeek, other.startWeek);
    const end = Math.min(bar.startWeek + bar.durationWeeks, other.startWeek + other.durationWeeks);
    out.push({
      envId: env.id,
      barAId: bar.id,
      barBId: other.id,
      swimlaneAId: bar.swimlaneId,
      swimlaneBId: other.swimlaneId,
      phaseTypeA: bar.phaseType,
      phaseTypeB: other.phaseType,
      weekRange: [start, end],
    });
  }
  return out;
}

export function getInvolvedEnvNames(envs: Environment[], cs: Contention[]): string[] {
  const ids = new Set(cs.map(c => c.envId));
  return envs.filter(e => ids.has(e.id)).map(e => e.name);
}

export function pickNextEnvColor(existing: Environment[], palette: readonly string[]): string {
  const used = new Set(existing.map(e => e.color));
  for (const c of palette) if (!used.has(c)) return c;
  return palette[existing.length % palette.length];
}
