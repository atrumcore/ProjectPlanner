import type { Environment, GanttState, PhaseBar, PhaseType } from '../types/gantt';

/** A person or team reference — the atomic unit of people allocation. */
export interface ResourceRef {
  kind: 'person' | 'team';
  id: string;
}

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
  // Compare in whole-day units so adjacency matches the day-rounded labels
  // the user reads off the bars. Without this, sub-day float drift accumulated
  // from chained day-snap drag/resize ops can leave a bar's end at e.g.
  // 4 + 1/7, registering as a 1-day overlap with a bar starting at week 4
  // even though both bars visually still read as adjacent.
  const aStart = Math.round(a.startWeek * 7);
  const aEnd = Math.round((a.startWeek + a.durationWeeks) * 7);
  const bStart = Math.round(b.startWeek * 7);
  const bEnd = Math.round((b.startWeek + b.durationWeeks) * 7);
  return aStart < bEnd && bStart < aEnd;
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

export function pickNextEnvColor(
  existing: ReadonlyArray<{ color: string }>,
  palette: readonly string[],
): string {
  const used = new Set(existing.map(e => e.color));
  for (const c of palette) if (!used.has(c)) return c;
  return palette[existing.length % palette.length];
}

// ── People contention ──────────────────────────────────────────────────────
//
// Mirrors environment contention with people/teams as the exclusive resource:
// two bars on DIFFERENT swimlanes claiming the same person (assigneeIds) or
// the same team (teamIds) that overlap in whole-day time are double-booked.
// Deliberate v1 simplifications: same-lane overlaps are ignored (matching the
// env mental model), and a team assignment does NOT expand to its members —
// each person and each team is its own atomic resource.

export interface PeopleContention {
  resource: ResourceRef;
  barAId: string;
  barBId: string;
  swimlaneAId: string;
  swimlaneBId: string;
  phaseTypeA: PhaseType;
  phaseTypeB: PhaseType;
  weekRange: [number, number];
}

type PeopleContentionInput = Pick<GanttState, 'people' | 'teams' | 'phaseBars'>;

const resourceKey = (r: ResourceRef) => `${r.kind}:${r.id}`;

/** The resources a bar claims, filtered to ids that exist in the registry. */
function barResources(
  bar: PhaseBar,
  personIds: Set<string>,
  teamIds: Set<string>,
): ResourceRef[] {
  const out: ResourceRef[] = [];
  for (const id of bar.assigneeIds) if (personIds.has(id)) out.push({ kind: 'person', id });
  for (const id of bar.teamIds) if (teamIds.has(id)) out.push({ kind: 'team', id });
  return out;
}

/** For each person/team, find pairs of bars (different swimlanes) claiming
 * that resource that overlap in time. */
export function getPeopleContentions({ people, teams, phaseBars }: PeopleContentionInput): PeopleContention[] {
  if ((people.length === 0 && teams.length === 0) || phaseBars.length < 2) return [];

  const personIds = new Set(people.map(p => p.id));
  const teamIdSet = new Set(teams.map(t => t.id));

  // Bucket bars by every resource they claim.
  const barsByResource = new Map<string, { ref: ResourceRef; bars: PhaseBar[] }>();
  for (const bar of phaseBars) {
    for (const ref of barResources(bar, personIds, teamIdSet)) {
      const key = resourceKey(ref);
      let bucket = barsByResource.get(key);
      if (!bucket) { bucket = { ref, bars: [] }; barsByResource.set(key, bucket); }
      bucket.bars.push(bar);
    }
  }

  const result: PeopleContention[] = [];
  for (const { ref, bars } of barsByResource.values()) {
    if (bars.length < 2) continue;
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i];
        const b = bars[j];
        if (a.swimlaneId === b.swimlaneId) continue; // same project's own phases
        if (!barsOverlapInTime(a, b)) continue;

        const start = Math.max(a.startWeek, b.startWeek);
        const end = Math.min(a.startWeek + a.durationWeeks, b.startWeek + b.durationWeeks);
        result.push({
          resource: ref,
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

/** Recompute people contentions assuming `bar` were positioned at the supplied
 * (startWeek, durationWeeks) — the people analogue of getContentionsForBar,
 * used for the live CLEAR/CONFLICT pill during drags. */
export function getPeopleContentionsForBar(
  bar: PhaseBar,
  state: PeopleContentionInput,
): PeopleContention[] {
  const personIds = new Set(state.people.map(p => p.id));
  const teamIdSet = new Set(state.teams.map(t => t.id));
  const mine = barResources(bar, personIds, teamIdSet);
  if (mine.length === 0) return [];
  const mineKeys = new Set(mine.map(resourceKey));

  const out: PeopleContention[] = [];
  for (const other of state.phaseBars) {
    if (other.id === bar.id) continue;
    if (other.swimlaneId === bar.swimlaneId) continue;
    if (!barsOverlapInTime(bar, other)) continue;

    for (const ref of barResources(other, personIds, teamIdSet)) {
      if (!mineKeys.has(resourceKey(ref))) continue;
      const start = Math.max(bar.startWeek, other.startWeek);
      const end = Math.min(bar.startWeek + bar.durationWeeks, other.startWeek + other.durationWeeks);
      out.push({
        resource: ref,
        barAId: bar.id,
        barBId: other.id,
        swimlaneAId: bar.swimlaneId,
        swimlaneBId: other.swimlaneId,
        phaseTypeA: bar.phaseType,
        phaseTypeB: other.phaseType,
        weekRange: [start, end],
      });
    }
  }
  return out;
}
