import type { Section, Swimlane, TrackedItem } from '../types/gantt';
import { KIND_META, KIND_ORDER } from '../data/trackedKinds';
import { htmlToPlainText } from './plainText';

export interface NotesEmail {
  subject: string;
  body: string;
}

const PLAN_LEVEL_LABEL = 'Plan-level';

function formatItem(item: TrackedItem, prefix: string): string {
  const owner = item.owner ? `  (@${item.owner})` : '';
  return `      ${prefix} ${item.text}${owner}`;
}

/** One project's items, grouped by kind so a reader sees "Dependencies:" and
 * "Risks:" rather than an undifferentiated list — the whole reason the
 * register carries a kind. */
function formatProjectBlock(projectName: string, items: TrackedItem[]): string {
  const lines: string[] = [`▸ ${projectName}`];
  for (const kind of KIND_ORDER) {
    const ofKind = items.filter(i => i.kind === kind);
    if (ofKind.length === 0) continue;
    const meta = KIND_META[kind];
    const active = ofKind.filter(i => !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const done = ofKind.filter(i => i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    lines.push(`    ${meta.plural}:`);
    for (const i of active) lines.push(formatItem(i, '•'));
    for (const i of done) lines.push(formatItem(i, '✓'));
  }
  return lines.join('\n');
}

/**
 * Plain-text digest of the Open Items register for a mailto: link, grouped
 * section → project → kind. An item linked to several projects appears under
 * each of them, which is what a reader scanning one project wants.
 */
export function buildOpenItemsEmail(
  swimlanes: Swimlane[],
  sections: Section[],
  trackedItems: TrackedItem[],
  fileName: string | null,
): NotesEmail {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const longDate = today.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const subject = `Open items — ${fileName || 'Untitled'} — ${isoDate}`;

  if (trackedItems.length === 0) {
    const body = [
      `Open items as of ${longDate}`,
      fileName ? `File: ${fileName}` : '',
      '',
      'Nothing tracked.',
    ].filter(Boolean).join('\n');
    return { subject, body };
  }

  const swimlaneById = new Map(swimlanes.map(s => [s.id, s]));
  const orderedSections = [...sections].sort((a, b) => a.order - b.order);
  const blocks: string[] = [];

  for (const section of orderedSections) {
    const lanesInSection = swimlanes
      .filter(s => s.section === section.id)
      .sort((a, b) => a.order - b.order);

    const laneBlocks: string[] = [];
    for (const lane of lanesInSection) {
      const items = trackedItems.filter(i => i.swimlaneIds.includes(lane.id));
      if (items.length === 0) continue;
      laneBlocks.push(formatProjectBlock(htmlToPlainText(lane.projectName), items));
    }

    if (laneBlocks.length === 0) continue;
    blocks.push(`═══ ${section.label} ═══\n\n${laneBlocks.join('\n\n')}`);
  }

  // Plan-level items, plus anything whose every link points at a project that
  // no longer exists (so nothing is silently dropped from the digest).
  const planLevel = trackedItems.filter(
    i => i.swimlaneIds.filter(id => swimlaneById.has(id)).length === 0
  );
  if (planLevel.length > 0) {
    blocks.push(
      `═══ ${PLAN_LEVEL_LABEL} ═══\n\n${formatProjectBlock(PLAN_LEVEL_LABEL, planLevel)}`
    );
  }

  const header = [
    `Open items as of ${longDate}`,
    fileName ? `File: ${fileName}` : '',
  ].filter(Boolean).join('\n');

  const body = `${header}\n\n${blocks.join('\n\n')}\n`;
  return { subject, body };
}
