import type { ActionItem, Section, Swimlane } from '../types/gantt';

export interface NotesEmail {
  subject: string;
  body: string;
}

const GENERAL_LABEL = 'General';

function formatItem(item: ActionItem, prefix: string): string {
  const owner = item.owner ? `  (@${item.owner})` : '';
  return `      ${prefix} ${item.text}${owner}`;
}

function formatProjectBlock(projectName: string, items: ActionItem[]): string {
  const active = items
    .filter(i => !i.done)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = items
    .filter(i => i.done)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lines: string[] = [`▸ ${projectName}`];
  if (active.length > 0) {
    lines.push('    Active:');
    for (const i of active) lines.push(formatItem(i, '•'));
  }
  if (done.length > 0) {
    lines.push('    Completed:');
    for (const i of done) lines.push(formatItem(i, '✓'));
  }
  return lines.join('\n');
}

export function buildNotesEmail(
  swimlanes: Swimlane[],
  sections: Section[],
  actionItems: ActionItem[],
  fileName: string | null,
): NotesEmail {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const longDate = today.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const subject = `Roadmap notes — ${fileName || 'Untitled'} — ${isoDate}`;

  if (actionItems.length === 0) {
    const body = [
      `Roadmap notes as of ${longDate}`,
      fileName ? `File: ${fileName}` : '',
      '',
      'No action items.',
    ].filter(Boolean).join('\n');
    return { subject, body };
  }

  const swimlaneById = new Map(swimlanes.map(s => [s.id, s]));

  // Group items: valid swimlane → lane.id; otherwise → null (General)
  const byLane = new Map<string | null, ActionItem[]>();
  for (const item of actionItems) {
    const laneId = item.swimlaneId && swimlaneById.has(item.swimlaneId)
      ? item.swimlaneId
      : null;
    const list = byLane.get(laneId) ?? [];
    list.push(item);
    byLane.set(laneId, list);
  }

  const orderedSections = [...sections].sort((a, b) => a.order - b.order);
  const blocks: string[] = [];

  for (const section of orderedSections) {
    const lanesInSection = swimlanes
      .filter(s => s.section === section.id)
      .sort((a, b) => a.order - b.order);

    const laneBlocks: string[] = [];
    for (const lane of lanesInSection) {
      const items = byLane.get(lane.id);
      if (!items || items.length === 0) continue;
      laneBlocks.push(formatProjectBlock(lane.projectName, items));
    }

    if (laneBlocks.length === 0) continue;
    blocks.push(`═══ ${section.label} ═══\n\n${laneBlocks.join('\n\n')}`);
  }

  const generalItems = byLane.get(null);
  if (generalItems && generalItems.length > 0) {
    blocks.push(
      `═══ ${GENERAL_LABEL} ═══\n\n${formatProjectBlock(GENERAL_LABEL, generalItems)}`
    );
  }

  const header = [
    `Roadmap notes as of ${longDate}`,
    fileName ? `File: ${fileName}` : '',
  ].filter(Boolean).join('\n');

  const body = `${header}\n\n${blocks.join('\n\n')}\n`;
  return { subject, body };
}
