import type { Section, Swimlane } from '../types/gantt';
import { htmlToPlainText } from './plainText';

/** Quote a single CSV field per RFC 4180 (double-up embedded quotes). */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV of all swimlanes with columns: Section, Project Name, Key Features.
 * Rows are ordered by section order, then by swimlane order within each section.
 * Swimlanes whose section id doesn't resolve fall back to an empty section label.
 */
export function buildSwimlaneCsv(swimlanes: Swimlane[], sections: Section[]): string {
  const sectionById = new Map(sections.map(s => [s.id, s]));
  const sectionOrder = (id: string) => sectionById.get(id)?.order ?? Number.MAX_SAFE_INTEGER;

  const ordered = [...swimlanes].sort((a, b) => {
    const sectionDelta = sectionOrder(a.section) - sectionOrder(b.section);
    return sectionDelta !== 0 ? sectionDelta : a.order - b.order;
  });

  const header = ['Section', 'Project Name', 'Key Features'];
  const rows = ordered.map(lane => [
    csvField(sectionById.get(lane.section)?.label ?? ''),
    csvField(htmlToPlainText(lane.projectName)),
    csvField(htmlToPlainText(lane.keyFeatures, '; ')),
  ].join(','));

  // `sep=,` tells Excel to split on commas even when the machine's regional
  // list separator is a semicolon (otherwise every row lands in one column).
  // Leading BOM keeps UTF-8 intact; CRLF line endings per RFC 4180.
  return '﻿' + ['sep=,', header.map(csvField).join(','), ...rows].join('\r\n') + '\r\n';
}
