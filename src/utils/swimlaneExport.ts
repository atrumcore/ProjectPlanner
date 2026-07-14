import type { Section, Swimlane, PhaseBar, PhaseTypeDef, TimelineConfig } from '../types/gantt';
import { htmlToPlainText } from './plainText';
import { getDateAtWeekOffset } from './dateUtils';

/** Quote a single CSV field per RFC 4180 (double-up embedded quotes). */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** YYYY-MM-DD in local time — Excel-sortable and locale-independent. */
function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build a CSV of every swimlane broken down by phase bar, with columns:
 * Section, Project Name, Phase, Start Date, End Date, Duration (Days),
 * Key Features.
 *
 * Grain is one row per phase bar. A swimlane with no phase bars still emits a
 * single row (blank phase/date columns) so it isn't dropped from the export.
 * Rows are ordered by section order, then swimlane order, then chronologically
 * by phase-bar start within each swimlane. Key Features are swimlane-level, so
 * they appear only on a swimlane's first row to avoid repeating long text.
 *
 * Dates match the on-bar tooltip: the start is the bar's first day and the end
 * is its last (inclusive) day.
 */
export function buildSwimlaneCsv(
  swimlanes: Swimlane[],
  sections: Section[],
  phaseBars: PhaseBar[],
  phaseTypes: PhaseTypeDef[],
  timeline: Pick<TimelineConfig, 'startMonth' | 'startYear'>,
): string {
  const sectionById = new Map(sections.map(s => [s.id, s]));
  const sectionOrder = (id: string) => sectionById.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  const phaseTypeById = new Map(phaseTypes.map(t => [t.id, t]));

  // Group bars by swimlane, chronological within each lane.
  const barsByLane = new Map<string, PhaseBar[]>();
  for (const bar of phaseBars) {
    const list = barsByLane.get(bar.swimlaneId);
    if (list) list.push(bar);
    else barsByLane.set(bar.swimlaneId, [bar]);
  }
  for (const list of barsByLane.values()) list.sort((a, b) => a.startWeek - b.startWeek);

  const ordered = [...swimlanes].sort((a, b) => {
    const sectionDelta = sectionOrder(a.section) - sectionOrder(b.section);
    return sectionDelta !== 0 ? sectionDelta : a.order - b.order;
  });

  const header = ['Section', 'Project Name', 'Phase', 'Start Date', 'End Date', 'Duration (Days)', 'Key Features'];
  const rows: string[] = [];

  for (const lane of ordered) {
    const sectionLabel = sectionById.get(lane.section)?.label ?? '';
    const projectName = htmlToPlainText(lane.projectName);
    const keyFeatures = htmlToPlainText(lane.keyFeatures, '; ');
    const bars = barsByLane.get(lane.id) ?? [];

    if (bars.length === 0) {
      rows.push([
        csvField(sectionLabel), csvField(projectName),
        csvField(''), csvField(''), csvField(''), csvField(''),
        csvField(keyFeatures),
      ].join(','));
      continue;
    }

    bars.forEach((bar, i) => {
      const startDate = getDateAtWeekOffset(timeline.startMonth, timeline.startYear, bar.startWeek);
      // End date is inclusive (last day of the bar), matching the on-bar tooltip.
      const endDate = getDateAtWeekOffset(timeline.startMonth, timeline.startYear, bar.startWeek + bar.durationWeeks - 1 / 7);
      const durationDays = Math.round(bar.durationWeeks * 7);
      const phaseName = bar.label || phaseTypeById.get(bar.phaseType)?.label || bar.phaseType;
      rows.push([
        csvField(sectionLabel),
        csvField(projectName),
        csvField(phaseName),
        csvField(formatISODate(startDate)),
        csvField(formatISODate(endDate)),
        csvField(String(durationDays)),
        // Key Features are swimlane-level — only on the lane's first bar row.
        csvField(i === 0 ? keyFeatures : ''),
      ].join(','));
    });
  }

  // `sep=,` tells Excel to split on commas even when the machine's regional
  // list separator is a semicolon (otherwise every row lands in one column).
  // Leading BOM keeps UTF-8 intact; CRLF line endings per RFC 4180.
  return '﻿' + ['sep=,', header.map(csvField).join(','), ...rows].join('\r\n') + '\r\n';
}
