import type { Section, Swimlane, TrackedItem } from '../types/gantt';
import { KIND_META, KIND_ORDER } from '../data/trackedKinds';
import { htmlToPlainText } from './plainText';
import { formatAge } from './dateUtils';

export interface NotesEmail {
  subject: string;
  /** Body sized to survive a mailto: URL. Equal to `full` when it fits. */
  body: string;
  /** The complete log, for the clipboard. */
  full: string;
  /** True when `body` had to be shortened to fit the URL budget. */
  truncated: boolean;
}

const PLAN_LEVEL_LABEL = 'Plan-level';

/** Open longer than this reads as aging and is called out in the summary. */
const AGING_DAYS = 30;

/**
 * Character budget for the whole `mailto:` URL.
 *
 * Outlook on Windows stops at roughly 2,048 characters and older Edge/IE at
 * 2,083; over that the handler does not error, it simply cuts the body off
 * wherever it ran out — so a long log arrives as a message that stops
 * mid-sentence. 1,900 leaves room for the scheme, the subject and the
 * percent-encoding overhead that varies by client.
 */
const MAILTO_BUDGET = 1900;

/**
 * ASCII only, deliberately.
 *
 * The previous digest drew itself with box characters (= and > and bullets).
 * They render inconsistently across mail clients — often as mojibake in
 * plain-text mode — and each one costs NINE characters of the URL budget
 * once percent-encoded, against one for an ASCII equivalent. On a 28-item log
 * that was 342 characters spent on decoration alone.
 */
const RULE = '-'.repeat(52);

function ageOf(item: TrackedItem): number {
  const t = new Date(item.createdAt).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : 0;
}

/** "Core Banking API | @NEC | 8d" — the attributes that qualify an item,
 * omitting any that are absent rather than printing empty separators. */
function attributesOf(item: TrackedItem, projectNames: string[]): string {
  return [
    projectNames.length ? projectNames.join(', ') : PLAN_LEVEL_LABEL,
    item.owner ? `@${item.owner}` : null,
    formatAge(item.createdAt),
  ].filter(Boolean).join(' | ');
}

/**
 * Plain-text RAID log for a mailto: link.
 *
 * Grouped by kind rather than by project, which is the convention the log is
 * named after and what a reviewer reads down in a RAID meeting. It also stops
 * an item that spans three projects being printed three times — the old
 * project-first grouping repeated it under each one, inflating both the page
 * and the URL budget.
 */
export function buildOpenItemsEmail(
  swimlanes: Swimlane[],
  sections: Section[],
  trackedItems: TrackedItem[],
  fileName: string | null,
): NotesEmail {
  const today = new Date();
  const longDate = today.toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const planName = (fileName || 'Untitled plan').replace(/\.[^.]+$/, '');
  const subject = `RAID log - ${planName} - ${today.toISOString().slice(0, 10)}`;

  const nameById = new Map(swimlanes.map(s => [s.id, htmlToPlainText(s.projectName) || 'Untitled project']));
  const projectsFor = (i: TrackedItem) =>
    i.swimlaneIds.map(id => nameById.get(id)).filter((n): n is string => !!n);

  const open = trackedItems.filter(i => !i.done);
  const closed = trackedItems.filter(i => i.done);
  const aging = open.filter(i => ageOf(i) > AGING_DAYS);

  const head = [`RAID LOG - ${planName}`, longDate, ''];

  if (trackedItems.length === 0) {
    const empty = [...head, 'Nothing tracked.'].join('\n');
    return { subject, body: empty, full: empty, truncated: false };
  }

  const summary = [
    `${open.length} open, ${closed.length} closed.`,
    aging.length ? ` ${aging.length} open longer than ${AGING_DAYS} days.` : '',
  ].join('');

  const lines: string[] = [...head, summary];

  // Oldest first within a kind: the top of each list is what has been waiting
  // longest, which is the question a review is actually asking.
  const byAge = (a: TrackedItem, b: TrackedItem) => a.createdAt.localeCompare(b.createdAt);

  for (const kind of KIND_ORDER) {
    const ofKind = open.filter(i => i.kind === kind).sort(byAge);
    if (ofKind.length === 0) continue;
    lines.push('', `${KIND_META[kind].plural.toUpperCase()} (${ofKind.length} open)`, RULE);
    ofKind.forEach((item, n) => {
      lines.push(`${n + 1}. ${item.text}`);
      lines.push(`   ${attributesOf(item, projectsFor(item))}`);
    });
  }

  if (closed.length > 0) {
    lines.push('', `CLOSED (${closed.length})`, RULE);
    for (const item of [...closed].sort(byAge)) {
      lines.push(`- ${item.text} (${KIND_META[item.kind].label}${item.owner ? `, @${item.owner}` : ''})`);
    }
  }

  // Sections are not printed as headings — a RAID log groups by kind — but an
  // item whose every project link is dangling would otherwise vanish, so
  // attributesOf falls back to Plan-level for it. Referencing `sections` keeps
  // the signature stable for callers.
  void sections;

  const full = `${lines.join('\n')}\n`;
  const fits = (text: string) =>
    `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`.length <= MAILTO_BUDGET;

  if (fits(full)) return { subject, body: full, full, truncated: false };

  /**
   * Too long for the URL. Send the header and summary rather than a body that
   * stops mid-item, and say plainly where the rest is — the caller puts the
   * full log on the clipboard. Silently cutting it off is what made a long log
   * arrive looking broken.
   */
  const short = [
    ...head,
    summary,
    '',
    'The full log was too long to place in this message and has been copied',
    'to your clipboard - paste it below.',
    '',
  ].join('\n');
  return { subject, body: short, full, truncated: true };
}
