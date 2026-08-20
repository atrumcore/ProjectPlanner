import type { Swimlane, TrackedItem, TrackedKind } from '../types/gantt';
import { KIND_META, KIND_ORDER } from '../data/trackedKinds';
import { htmlToPlainText } from './plainText';
import { formatAge } from './dateUtils';

/**
 * Rich-text RAID log, delivered as a .eml the mail client opens as a draft.
 *
 * mailto: cannot carry HTML — the scheme has no way to declare a content type,
 * so every client renders the body as plain text. It is also capped by URL
 * length, which silently truncated long logs. A .eml sidesteps both: it is the
 * message itself, MIME and all, and `X-Unsent: 1` tells Outlook to open it in
 * compose mode rather than as something already received. You get a formatted
 * draft, add recipients, and send.
 *
 * Everything here is written for Word's rendering engine, which is what
 * Outlook on Windows uses: tables for layout, styles inline on every element,
 * no flexbox, grid, or external stylesheet. It looks plain in a browser; it
 * survives in a mail client, which is the only place it will ever be read.
 */

/** Literal hex per kind. The app's KIND_META colours are CSS custom properties,
 * which mean nothing inside an email — these are the light-theme resolutions,
 * since mail clients compose on white. */
const KIND_HEX: Record<TrackedKind, string> = {
  action: '#b06f00',
  dependency: '#cb6600',
  risk: '#7a1f3d',
  issue: '#b52222',
  decision: '#00929f',
  assumption: '#6b7076',
};

const BRAND = '#ce181e';
const INK = '#1c1e21';
const MUTED = '#6b7076';
const HAIRLINE = '#e3e5e8';
const ZEBRA = '#f7f8f9';
const FONT = "'Segoe UI', Helvetica, Arial, sans-serif";

/** Open longer than this is called out in the summary. */
const AGING_DAYS = 30;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ageDays(item: TrackedItem): number {
  const t = new Date(item.createdAt).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : 0;
}

export interface RaidEmail {
  subject: string;
  html: string;
  /** Plain-text alternative, for clients that refuse HTML. */
  text: string;
}

export function buildRaidEmailHtml(
  swimlanes: Swimlane[],
  trackedItems: TrackedItem[],
  fileName: string | null,
): RaidEmail {
  const today = new Date();
  const longDate = today.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const planName = (fileName || 'Untitled plan').replace(/\.[^.]+$/, '');
  const subject = `RAID log - ${planName} - ${today.toISOString().slice(0, 10)}`;

  const nameById = new Map(swimlanes.map(s => [s.id, htmlToPlainText(s.projectName) || 'Untitled project']));
  const projectsOf = (i: TrackedItem) => {
    const names = i.swimlaneIds.map(id => nameById.get(id)).filter((n): n is string => !!n);
    return names.length ? names.join(', ') : 'Plan-level';
  };

  const open = trackedItems.filter(i => !i.done);
  const closed = trackedItems.filter(i => i.done);
  const aging = open.filter(i => ageDays(i) > AGING_DAYS);
  // Oldest first: the top of each table is what has been waiting longest.
  const byAge = (a: TrackedItem, b: TrackedItem) => a.createdAt.localeCompare(b.createdAt);

  const cell = (content: string, extra = '') =>
    `<td style="padding:7px 10px;border-bottom:1px solid ${HAIRLINE};font-size:13px;line-height:1.45;${extra}">${content}</td>`;

  const kindTable = (kind: TrackedKind, items: TrackedItem[]) => {
    const hex = KIND_HEX[kind];
    const rows = items.map((item, i) => {
      const bg = i % 2 ? ` background:${ZEBRA};` : '';
      const old = ageDays(item) > AGING_DAYS;
      return `<tr>`
        + cell(String(i + 1), `${bg}color:${MUTED};width:26px;text-align:right;`)
        + cell(esc(item.text), `${bg}color:${INK};`)
        + cell(esc(projectsOf(item)), `${bg}color:${MUTED};white-space:nowrap;`)
        + cell(item.owner ? esc(item.owner) : '<span style="color:#9aa0a6">unassigned</span>', `${bg}color:${MUTED};white-space:nowrap;`)
        // Aging items carry the kind colour so a long-open row is findable
        // by eye rather than by reading every date.
        + cell(esc(formatAge(item.createdAt)), `${bg}white-space:nowrap;text-align:right;${old ? `color:${hex};font-weight:600;` : `color:${MUTED};`}`)
        + `</tr>`;
    }).join('');

    const th = (label: string, extra = '') =>
      `<th align="left" style="padding:6px 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};font-weight:600;border-bottom:2px solid ${HAIRLINE};${extra}">${label}</th>`;

    return `
      <tr><td style="padding:26px 0 8px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:10px;height:10px;background:${hex};border-radius:2px;font-size:0;">&nbsp;</td>
          <td style="padding-left:8px;font-size:14px;font-weight:700;color:${INK};letter-spacing:.02em;">
            ${esc(KIND_META[kind].plural.toUpperCase())}
            <span style="font-weight:400;color:${MUTED};">&nbsp;${items.length} open</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>${th('', 'width:26px;')}${th('Item')}${th('Project')}${th('Owner')}${th('Age', 'text-align:right;')}</tr>
          ${rows}
        </table>
      </td></tr>`;
  };

  const sections = KIND_ORDER
    .map(kind => ({ kind, items: open.filter(i => i.kind === kind).sort(byAge) }))
    .filter(g => g.items.length > 0)
    .map(g => kindTable(g.kind, g.items))
    .join('');

  const closedBlock = closed.length === 0 ? '' : `
    <tr><td style="padding:26px 0 8px 0;font-size:14px;font-weight:700;color:${INK};">
      CLOSED <span style="font-weight:400;color:${MUTED};">&nbsp;${closed.length}</span>
    </td></tr>
    <tr><td style="font-size:13px;line-height:1.7;color:${MUTED};">
      ${[...closed].sort(byAge).map(i =>
        `&bull;&nbsp;${esc(i.text)} <span style="color:#9aa0a6">(${esc(KIND_META[i.kind].label)}${i.owner ? `, ${esc(i.owner)}` : ''})</span>`
      ).join('<br>')}
    </td></tr>`;

  const summary = trackedItems.length === 0
    ? 'Nothing tracked.'
    : `<b style="color:${INK};">${open.length} open</b>, ${closed.length} closed.`
      + (aging.length ? ` <b style="color:${BRAND};">${aging.length}</b> open longer than ${AGING_DAYS} days.` : '');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px;max-width:100%;font-family:${FONT};color:${INK};">

  <tr><td style="padding-bottom:2px;"><div style="width:28px;height:3px;background:${BRAND};font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:8px 0 2px 0;font-size:20px;font-weight:700;letter-spacing:.01em;">RAID log</td></tr>
  <tr><td style="font-size:13px;color:${MUTED};padding-bottom:14px;">${esc(planName)} &nbsp;&bull;&nbsp; ${esc(longDate)}</td></tr>

  <tr><td style="padding:11px 14px;background:${ZEBRA};border-left:3px solid ${BRAND};font-size:13px;color:${MUTED};">
    ${summary}
  </td></tr>

  ${sections}
  ${closedBlock}

  <tr><td style="padding:26px 0 0 0;border-top:1px solid ${HAIRLINE};font-size:11px;color:#9aa0a6;">
    Generated from ${esc(planName)} by BBD Project Planner.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  // Plain-text alternative for clients that will not render HTML.
  const textLines = [`RAID LOG - ${planName}`, longDate, '',
    `${open.length} open, ${closed.length} closed.`
    + (aging.length ? ` ${aging.length} open longer than ${AGING_DAYS} days.` : '')];
  for (const kind of KIND_ORDER) {
    const items = open.filter(i => i.kind === kind).sort(byAge);
    if (!items.length) continue;
    textLines.push('', `${KIND_META[kind].plural.toUpperCase()} (${items.length} open)`, '-'.repeat(52));
    items.forEach((item, n) => {
      textLines.push(`${n + 1}. ${item.text}`);
      textLines.push(`   ${[projectsOf(item), item.owner ? `@${item.owner}` : null, formatAge(item.createdAt)].filter(Boolean).join(' | ')}`);
    });
  }
  if (closed.length) {
    textLines.push('', `CLOSED (${closed.length})`, '-'.repeat(52));
    for (const i of [...closed].sort(byAge)) {
      textLines.push(`- ${i.text} (${KIND_META[i.kind].label}${i.owner ? `, @${i.owner}` : ''})`);
    }
  }

  return { subject, html, text: `${textLines.join('\n')}\n` };
}

/** RFC 2047 encoded-word, so a subject with non-ASCII survives the header. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?utf-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}

/** Base64 with CRLF-delimited 76-character lines, per RFC 2045. */
function base64Lines(input: string): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(input)));
  return (b64.match(/.{1,76}/g) ?? []).join('\r\n');
}

/**
 * Wrap the message as a multipart/alternative .eml.
 *
 * `X-Unsent: 1` is the header Outlook reads to open the file as a composable
 * draft instead of a received message — without it you get a read-only item
 * you cannot send. Both parts are base64'd so nothing has to be quoted-
 * printable-escaped and no line can exceed the 998-octet limit.
 */
export function buildEmlFile(mail: RaidEmail): Blob {
  const boundary = `----bbd-raid-${Math.random().toString(36).slice(2, 12)}`;
  const eml = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    `Subject: ${encodeHeader(mail.subject)}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(mail.text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(mail.html),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return new Blob([eml], { type: 'message/rfc822' });
}
