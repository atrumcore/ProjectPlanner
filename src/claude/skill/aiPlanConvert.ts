/**
 * Deterministic mapping between the app's exported document format and the
 * AI-facing plan format (see aiPlan.ts).
 *
 *  - `docToAiPlan`  : projection of the current document sent to Claude.
 *  - `aiPlanToDoc`  : converts Claude's returned end-state back into a full
 *                     document ready for `importFromJSON`, plus a diff and
 *                     warnings for the proposal card.
 *
 * Claude works in calendar dates and names; this module owns all date↔week
 * math and name↔id resolution. Everything Claude never sees (action items,
 * floating notes, environments, phase-type definitions, view preferences,
 * save attribution) passes through from the base document untouched.
 */

import type {
  Dependency, Milestone, Person, PhaseBar, Section, Swimlane, Team,
  TimelineConfig, PhaseTypeDef,
} from '../../types/gantt';
import { PEOPLE_COLOR_PRESETS } from '../../types/gantt';
import { getDateAtWeekOffset } from '../../utils/dateUtils';
import { featuresArrayToHtml } from '../../utils/htmlSanitize';
import type { AiPlanDoc, AiProject } from './aiPlan';

/** Shape of `JSON.parse(exportToJSON())`. Named fields are the ones this
 * module reads or replaces; everything else rides along via the index
 * signature and is passed through untouched. */
export interface ExportedDoc {
  sections: Section[];
  swimlanes: Swimlane[];
  phaseBars: PhaseBar[];
  milestones: Milestone[];
  dependencies: Dependency[];
  teams: Team[];
  people: Person[];
  phaseTypes: PhaseTypeDef[];
  timeline: TimelineConfig;
  [key: string]: unknown;
}

export interface PlanDiff {
  addedProjects: string[];
  removedProjects: string[];
  modifiedProjects: string[];
  phaseCount: number;
  milestoneCount: number;
  addedPeople: string[];
  removedPeople: string[];
  addedTeams: string[];
  removedTeams: string[];
  /** Human sentence when the timeline anchor/length changes, else null. */
  timelineChange: string | null;
}

export interface ConvertResult {
  docJson: string;
  diff: PlanDiff;
  warnings: string[];
}

const uid = () => crypto.randomUUID();
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
/** Safety cap on generated timeline length (5 years of weeks). */
const MAX_TOTAL_WEEKS = 260;
/** Store discards pre-2026 documents on reload — never anchor before this. */
const MIN_START_YEAR = 2026;

const norm = (s: string) => s.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dates are whole days but week offsets are fractional (a half-week bar is
 * 10.5 days), so an unchanged entity can come back ±half a day off. Snap to
 * the original value when within that rounding envelope — a genuine change
 * (≥ 1 day) always exceeds it. */
const DATE_ROUNDING_TOLERANCE = 0.08;
const snapTo = (value: number, original: number | undefined): number =>
  original !== undefined && Math.abs(value - original) <= DATE_ROUNDING_TOLERANCE
    ? original
    : value;

/** Local-date YYYY-MM-DD (not toISOString — avoids TZ day-shift). */
function formatLocalDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date; null when malformed. */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.trim?.() ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** Extract plain-text bullets from a keyFeatures/keyDependencies HTML string. */
function htmlToBullets(html: string): string[] {
  if (!html) return [];
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  const lis = Array.from(doc.querySelectorAll('li'))
    .map(li => (li.textContent ?? '').trim())
    .filter(Boolean);
  if (lis.length > 0) return lis;
  return (doc.body.textContent ?? '')
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);
}

const BUILTIN_TYPE_IDS = new Set(['analysis', 'development', 'sit', 'uat', 'live', 'concept', 'custom']);

/* ------------------------------------------------------------------ */
/* Document → AI plan (projection sent to Claude)                      */
/* ------------------------------------------------------------------ */

export function docToAiPlan(doc: ExportedDoc): AiPlanDoc {
  const { startMonth, startYear } = doc.timeline;
  const weekToDate = (week: number) =>
    formatLocalDate(getDateAtWeekOffset(startMonth, startYear, week));

  const sectionById = new Map(doc.sections.map(s => [s.id, s]));
  const teamById = new Map(doc.teams.map(t => [t.id, t]));
  const personById = new Map(doc.people.map(p => [p.id, p]));
  const typeById = new Map(doc.phaseTypes.map(t => [t.id, t]));

  const typeKeyFor = (phaseType: string): string => {
    if (BUILTIN_TYPE_IDS.has(phaseType)) return phaseType;
    const def = typeById.get(phaseType);
    return def ? def.name : phaseType;
  };

  const barsByLane = new Map<string, PhaseBar[]>();
  for (const bar of doc.phaseBars) {
    const list = barsByLane.get(bar.swimlaneId) ?? [];
    list.push(bar);
    barsByLane.set(bar.swimlaneId, list);
  }
  const milestonesByLane = new Map<string, Milestone[]>();
  for (const ms of doc.milestones) {
    const list = milestonesByLane.get(ms.swimlaneId) ?? [];
    list.push(ms);
    milestonesByLane.set(ms.swimlaneId, list);
  }

  const laneSortKey = (lane: Swimlane): [number, number] => [
    sectionById.get(lane.section)?.order ?? 999,
    lane.order,
  ];
  const sortedLanes = [...doc.swimlanes].sort((a, b) => {
    const [as, ao] = laneSortKey(a);
    const [bs, bo] = laneSortKey(b);
    return as - bs || ao - bo;
  });

  const projects: AiProject[] = sortedLanes.map(lane => ({
    id: lane.id,
    name: lane.projectName,
    section: sectionById.get(lane.section)?.label ?? lane.section,
    featureBullets: htmlToBullets(lane.keyFeatures),
    dependencyBullets: htmlToBullets(lane.keyDependencies),
    ownerPersonNames: lane.assigneeIds.map(id => personById.get(id)?.name).filter((n): n is string => !!n),
    ownerTeamNames: lane.teamIds.map(id => teamById.get(id)?.name).filter((n): n is string => !!n),
    phases: (barsByLane.get(lane.id) ?? [])
      .slice()
      .sort((a, b) => a.startWeek - b.startWeek)
      .map(bar => ({
        ref: bar.id,
        typeKey: typeKeyFor(bar.phaseType),
        label: bar.label || null,
        startDate: weekToDate(bar.startWeek),
        endDate: weekToDate(bar.startWeek + bar.durationWeeks),
        assigneeNames: bar.assigneeIds.map(id => personById.get(id)?.name).filter((n): n is string => !!n),
        teamNames: bar.teamIds.map(id => teamById.get(id)?.name).filter((n): n is string => !!n),
      })),
    milestones: (milestonesByLane.get(lane.id) ?? [])
      .slice()
      .sort((a, b) => a.week - b.week)
      .map(ms => ({ date: weekToDate(ms.week) })),
  }));

  return {
    timelineStart: formatLocalDate(new Date(startYear, startMonth, 1)),
    sections: [...doc.sections].sort((a, b) => a.order - b.order).map(s => ({ name: s.label })),
    teams: [...doc.teams].sort((a, b) => a.order - b.order).map(t => ({ name: t.name })),
    people: [...doc.people].sort((a, b) => a.order - b.order).map(p => ({
      name: p.name,
      role: p.role ?? null,
      teamName: (p.teamId && teamById.get(p.teamId)?.name) || null,
    })),
    projects,
    dependencies: doc.dependencies.map(d => ({ fromRef: d.fromBarId, toRef: d.toBarId })),
  };
}

/* ------------------------------------------------------------------ */
/* AI plan → document (apply-ready JSON + diff + warnings)             */
/* ------------------------------------------------------------------ */

export function aiPlanToDoc(plan: AiPlanDoc, baseDoc: ExportedDoc): ConvertResult {
  const warnings: string[] = [];

  /* -- 1. Timeline anchor -------------------------------------------- */
  const docEmpty = baseDoc.swimlanes.length === 0 && baseDoc.phaseBars.length === 0;
  let startMonth = baseDoc.timeline.startMonth;
  let startYear = baseDoc.timeline.startYear;
  if (docEmpty) {
    const start = parseLocalDate(plan.timelineStart);
    if (start) {
      startMonth = start.getMonth();
      startYear = start.getFullYear();
    }
    if (startYear < MIN_START_YEAR) {
      warnings.push(`Timeline start ${startYear} is before ${MIN_START_YEAR} — clamped to Jan ${MIN_START_YEAR}.`);
      startMonth = 0;
      startYear = MIN_START_YEAR;
    }
  }
  const anchorDate = new Date(startYear, startMonth, 1);
  const dateToWeek = (d: Date) => round2((d.getTime() - anchorDate.getTime()) / MS_PER_WEEK);

  /* -- 2. Teams ------------------------------------------------------ */
  const baseTeamByName = new Map(baseDoc.teams.map(t => [norm(t.name), t]));
  const teams: Team[] = [];
  const teamIdByName = new Map<string, string>();
  const ensureTeam = (name: string, fromList: boolean): string => {
    const key = norm(name);
    const existingOut = teamIdByName.get(key);
    if (existingOut) return existingOut;
    const base = baseTeamByName.get(key);
    const team: Team = base
      ? { ...base, order: teams.length }
      : { id: uid(), name: name.trim(), color: PEOPLE_COLOR_PRESETS[teams.length % PEOPLE_COLOR_PRESETS.length], order: teams.length };
    if (!base && !fromList) warnings.push(`Team "${name}" was referenced but not in the teams list — created it.`);
    teams.push(team);
    teamIdByName.set(key, team.id);
    return team.id;
  };
  for (const t of plan.teams) {
    if (t.name.trim()) ensureTeam(t.name, true);
  }

  /* -- 3. People ----------------------------------------------------- */
  const basePersonByName = new Map(baseDoc.people.map(p => [norm(p.name), p]));
  const people: Person[] = [];
  const personIdByName = new Map<string, string>();
  const ensurePerson = (name: string, role: string | null, teamName: string | null, fromList: boolean): string => {
    const key = norm(name);
    const existingOut = personIdByName.get(key);
    if (existingOut) return existingOut;
    const base = basePersonByName.get(key);
    const teamId = teamName?.trim() ? ensureTeam(teamName, false) : base?.teamId ?? null;
    const person: Person = {
      id: base?.id ?? uid(),
      name: base?.name ?? name.trim(),
      color: base?.color ?? PEOPLE_COLOR_PRESETS[(people.length + 3) % PEOPLE_COLOR_PRESETS.length],
      order: people.length,
      ...(role?.trim() ? { role: role.trim() } : base?.role ? { role: base.role } : {}),
      ...(teamId ? { teamId } : {}),
    };
    if (!base && !fromList) warnings.push(`Person "${name}" was referenced but not in the people list — created them.`);
    people.push(person);
    personIdByName.set(key, person.id);
    return person.id;
  };
  for (const p of plan.people) {
    if (p.name.trim()) ensurePerson(p.name, p.role, p.teamName, true);
  }

  /* -- 4. Sections --------------------------------------------------- */
  const baseSectionByLabel = new Map(baseDoc.sections.map(s => [norm(s.label), s]));
  const sections: Section[] = [];
  const sectionIdByName = new Map<string, string>();
  const ensureSection = (name: string, fromList: boolean): string => {
    const key = norm(name);
    const existingOut = sectionIdByName.get(key);
    if (existingOut) return existingOut;
    const base = baseSectionByLabel.get(key);
    const section: Section = base
      ? { ...base, order: sections.length }
      : { id: uid(), label: name.trim(), order: sections.length };
    if (!base && !fromList) warnings.push(`Section "${name}" was referenced but not in the sections list — added it.`);
    sections.push(section);
    sectionIdByName.set(key, section.id);
    return section.id;
  };
  for (const s of plan.sections) {
    if (s.name.trim()) ensureSection(s.name, true);
  }
  if (sections.length === 0) ensureSection('In Progress', true);

  /* -- 5. Projects → swimlanes -------------------------------------- */
  const baseLaneById = new Map(baseDoc.swimlanes.map(l => [l.id, l]));
  const baseLaneByName = new Map(baseDoc.swimlanes.map(l => [norm(l.projectName), l]));
  const baseBarById = new Map(baseDoc.phaseBars.map(b => [b.id, b]));
  const baseMilestoneWeeks = new Map<string, number[]>();
  for (const ms of baseDoc.milestones) {
    const list = baseMilestoneWeeks.get(ms.swimlaneId) ?? [];
    list.push(ms.week);
    baseMilestoneWeeks.set(ms.swimlaneId, list);
  }
  const baseTypeById = new Map(baseDoc.phaseTypes.map(t => [t.id, t]));
  const baseTypeByName = new Map(baseDoc.phaseTypes.map(t => [norm(t.name), t]));

  const swimlanes: Swimlane[] = [];
  const phaseBars: PhaseBar[] = [];
  const milestones: Milestone[] = [];
  const barIdByRef = new Map<string, string>();
  const orderInSection = new Map<string, number>();

  for (const project of plan.projects) {
    if (!project.name.trim()) {
      warnings.push('Skipped a project with an empty name.');
      continue;
    }
    const baseLane = (project.id && baseLaneById.get(project.id)) || baseLaneByName.get(norm(project.name));
    const sectionId = ensureSection(project.section?.trim() || sections[0].label, false);
    const order = orderInSection.get(sectionId) ?? 0;
    orderInSection.set(sectionId, order + 1);

    const lane: Swimlane = {
      id: baseLane?.id ?? uid(),
      projectName: project.name.trim(),
      keyFeatures: featuresArrayToHtml(project.featureBullets.filter(b => b.trim())),
      keyDependencies: featuresArrayToHtml(project.dependencyBullets.filter(b => b.trim())),
      section: sectionId,
      order,
      assigneeIds: project.ownerPersonNames.filter(n => n.trim()).map(n => ensurePerson(n, null, null, false)),
      teamIds: project.ownerTeamNames.filter(n => n.trim()).map(n => ensureTeam(n, false)),
    };
    // New lanes get no tint by default (matches manual add behaviour).
    if (baseLane?.color) lane.color = baseLane.color;
    swimlanes.push(lane);

    /* -- Phases → bars -- */
    for (const phase of project.phases) {
      const start = parseLocalDate(phase.startDate);
      const end = parseLocalDate(phase.endDate);
      if (!start || !end) {
        warnings.push(`Skipped phase "${phase.label ?? phase.typeKey}" on "${project.name}" — invalid date.`);
        continue;
      }
      let rawStart = dateToWeek(start);
      let rawEnd = dateToWeek(end);
      if (rawEnd < rawStart) {
        warnings.push(`Phase "${phase.label ?? phase.typeKey}" on "${project.name}" ends before it starts — dates swapped.`);
        [rawStart, rawEnd] = [rawEnd, rawStart];
      }
      if (rawStart < 0) {
        warnings.push(`Phase "${phase.label ?? phase.typeKey}" on "${project.name}" starts before the timeline (${phase.startDate}) — clamped to the timeline start.`);
      }
      const existingBar = baseBarById.get(phase.ref);
      const startWeek = snapTo(Math.max(0, rawStart), existingBar?.startWeek);
      const durationWeeks = snapTo(
        Math.max(0.2, round2(rawEnd - startWeek)),
        existingBar?.durationWeeks,
      );

      // Resolve the phase type: exact id, then name, else custom.
      const typeDef = baseTypeById.get(phase.typeKey) ?? baseTypeByName.get(norm(phase.typeKey));
      let phaseType = typeDef?.id ?? 'custom';
      let label = phase.label ?? '';
      if (!typeDef && !BUILTIN_TYPE_IDS.has(phase.typeKey)) {
        phaseType = 'custom';
        if (!label) label = phase.typeKey;
        warnings.push(`Unknown phase type "${phase.typeKey}" on "${project.name}" — rendered as Custom.`);
      } else if (!typeDef) {
        phaseType = phase.typeKey; // built-in id not present in doc types (shouldn't happen; importer migrates)
      }

      const bar: PhaseBar = {
        id: existingBar?.id ?? uid(),
        swimlaneId: lane.id,
        phaseType,
        label,
        startWeek,
        durationWeeks,
        environmentId: existingBar?.environmentId ?? null,
        assigneeIds: phase.assigneeNames.filter(n => n.trim()).map(n => ensurePerson(n, null, null, false)),
        teamIds: phase.teamNames.filter(n => n.trim()).map(n => ensureTeam(n, false)),
      };
      if (existingBar?.colorOverride) bar.colorOverride = existingBar.colorOverride;
      barIdByRef.set(phase.ref, bar.id);
      phaseBars.push(bar);
    }

    /* -- Milestones -- */
    for (const ms of project.milestones) {
      const date = parseLocalDate(ms.date);
      if (!date) {
        warnings.push(`Skipped a milestone on "${project.name}" — invalid date "${ms.date}".`);
        continue;
      }
      const week = Math.max(0, dateToWeek(date));
      // Snap to the closest original milestone on this lane within the date
      // rounding envelope, so unchanged milestones don't read as edits.
      const closest = (baseMilestoneWeeks.get(lane.id) ?? [])
        .reduce<number | undefined>((best, w) =>
          best === undefined || Math.abs(w - week) < Math.abs(best - week) ? w : best, undefined);
      milestones.push({ id: uid(), swimlaneId: lane.id, week: snapTo(week, closest) });
    }
  }

  /* -- 6. Dependencies ----------------------------------------------- */
  const baseDepByPair = new Map(baseDoc.dependencies.map(d => [`${d.fromBarId}→${d.toBarId}`, d]));
  const dependencies: Dependency[] = [];
  for (const dep of plan.dependencies) {
    const fromBarId = barIdByRef.get(dep.fromRef);
    const toBarId = barIdByRef.get(dep.toRef);
    if (!fromBarId || !toBarId || fromBarId === toBarId) {
      warnings.push(`Dropped a dependency (${dep.fromRef} → ${dep.toRef}) — unresolved phase reference.`);
      continue;
    }
    const existing = baseDepByPair.get(`${fromBarId}→${toBarId}`);
    dependencies.push({ id: existing?.id ?? uid(), fromBarId, toBarId });
  }

  /* -- 7. Timeline length -------------------------------------------- */
  let maxEnd = 0;
  for (const bar of phaseBars) maxEnd = Math.max(maxEnd, bar.startWeek + bar.durationWeeks);
  for (const ms of milestones) maxEnd = Math.max(maxEnd, ms.week);
  const anchorUnchanged =
    startMonth === baseDoc.timeline.startMonth && startYear === baseDoc.timeline.startYear;
  let totalWeeks = Math.max(anchorUnchanged ? baseDoc.timeline.totalWeeks : 8, Math.ceil(maxEnd) + 4);
  if (totalWeeks > MAX_TOTAL_WEEKS) {
    warnings.push(`Plan spans ${totalWeeks} weeks — capped at ${MAX_TOTAL_WEEKS}.`);
    totalWeeks = MAX_TOTAL_WEEKS;
  }
  const timeline: TimelineConfig = { ...baseDoc.timeline, startMonth, startYear, totalWeeks };

  /* -- 8. Assemble + diff -------------------------------------------- */
  const doc: ExportedDoc = {
    ...baseDoc,
    sections,
    swimlanes,
    phaseBars,
    milestones,
    dependencies,
    teams,
    people,
    timeline,
  };

  const diff = buildDiff(baseDoc, doc);
  return { docJson: JSON.stringify(doc, null, 2), diff, warnings };
}

/* ------------------------------------------------------------------ */
/* Diff                                                                */
/* ------------------------------------------------------------------ */

/** Per-lane bundle used to detect modifications (lane + its bars + milestones). */
function laneBundle(doc: ExportedDoc, laneId: string): string {
  const lane = doc.swimlanes.find(l => l.id === laneId);
  const bars = doc.phaseBars
    .filter(b => b.swimlaneId === laneId)
    .slice()
    .sort((a, b) => a.startWeek - b.startWeek || a.id.localeCompare(b.id));
  const ms = doc.milestones
    .filter(m => m.swimlaneId === laneId)
    .map(m => m.week)
    .sort((a, b) => a - b);
  // Milestone ids are regenerated on every convert, so compare weeks only.
  return JSON.stringify({ lane: { ...lane, order: 0 }, bars, ms });
}

function buildDiff(base: ExportedDoc, next: ExportedDoc): PlanDiff {
  const baseLanes = new Map(base.swimlanes.map(l => [l.id, l]));
  const nextLanes = new Map(next.swimlanes.map(l => [l.id, l]));

  const addedProjects: string[] = [];
  const modifiedProjects: string[] = [];
  for (const [id, lane] of nextLanes) {
    if (!baseLanes.has(id)) addedProjects.push(lane.projectName);
    else if (laneBundle(base, id) !== laneBundle(next, id)) modifiedProjects.push(lane.projectName);
  }
  const removedProjects = [...baseLanes.values()]
    .filter(l => !nextLanes.has(l.id))
    .map(l => l.projectName);

  const basePeople = new Map(base.people.map(p => [p.id, p]));
  const nextPeople = new Map(next.people.map(p => [p.id, p]));
  const baseTeams = new Map(base.teams.map(t => [t.id, t]));
  const nextTeams = new Map(next.teams.map(t => [t.id, t]));

  let timelineChange: string | null = null;
  const bt = base.timeline;
  const nt = next.timeline;
  if (bt.startMonth !== nt.startMonth || bt.startYear !== nt.startYear) {
    timelineChange = `timeline starts ${new Date(nt.startYear, nt.startMonth, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  } else if (nt.totalWeeks > bt.totalWeeks) {
    timelineChange = `extends timeline to ${nt.totalWeeks} weeks`;
  }

  return {
    addedProjects,
    removedProjects,
    modifiedProjects,
    phaseCount: next.phaseBars.length,
    milestoneCount: next.milestones.length,
    addedPeople: [...nextPeople.values()].filter(p => !basePeople.has(p.id)).map(p => p.name),
    removedPeople: [...basePeople.values()].filter(p => !nextPeople.has(p.id)).map(p => p.name),
    addedTeams: [...nextTeams.values()].filter(t => !baseTeams.has(t.id)).map(t => t.name),
    removedTeams: [...baseTeams.values()].filter(t => !nextTeams.has(t.id)).map(t => t.name),
    timelineChange,
  };
}
