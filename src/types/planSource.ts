// Where the currently-open plan lives, and how we detect that someone else
// changed it.
//
// Two providers today:
//   local — a file on disk via the File System Access API. Change detection
//           compares the file's lastModified timestamp.
//   graph — a file in Microsoft 365 (a Team's Roadmaps folder, or the user's
//           OneDrive drafts). Change detection compares the driveItem eTag,
//           which is also what `If-Match` uses to make saves conflict-safe.
//
// Both flow through the same store actions (saveFile, openFile,
// checkFileFreshness, reloadFromDisk) and reuse the same conflict/refresh UI.

/** Where a Graph-hosted plan sits, for display and for "new plan here". */
export type PlanContainer =
  | { type: 'team'; teamId: string; teamName: string }
  | { type: 'drafts' };

export type PlanSource =
  | { kind: 'local'; handle: FileSystemFileHandle }
  | {
      kind: 'graph';
      driveId: string;
      itemId: string;
      name: string;
      /** SharePoint/OneDrive URL — lets us offer "open in Teams". */
      webUrl?: string;
      container: PlanContainer;
    };

/** The version of the file this session considers "ours". A newer value on
 *  the server means somebody else saved since we opened or last saved. */
export type PlanBaseline =
  | { kind: 'local'; lastModifiedMs: number }
  | { kind: 'graph'; eTag: string };

/** Opaque marker used to compare "what we have" against "what's out there" —
 *  a timestamp for local files, an eTag for Graph items. */
export type PlanMarker = number | string;

export function baselineMarker(baseline: PlanBaseline): PlanMarker {
  return baseline.kind === 'local' ? baseline.lastModifiedMs : baseline.eTag;
}

/** Serialisable reference to a Graph plan, for the recent-plans list.
 *  Local plans are excluded because file handles can't be serialised. */
export interface PlanRef {
  driveId: string;
  itemId: string;
  name: string;
  container: PlanContainer;
  /** ISO timestamp of when this session last opened it. */
  openedAtIso: string;
}

export function planSourceToRef(source: PlanSource): PlanRef | null {
  if (source.kind !== 'graph') return null;
  return {
    driveId: source.driveId,
    itemId: source.itemId,
    name: source.name,
    container: source.container,
    openedAtIso: new Date().toISOString(),
  };
}
