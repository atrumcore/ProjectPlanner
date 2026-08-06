// Shapes the app cares about, trimmed down from Microsoft Graph's DTOs.
// Both the real client and the mock tenant implement `GraphApi`.

export interface GraphTeam {
  id: string;
  displayName: string;
  description?: string;
}

export interface GraphMember {
  /** Entra object id of the user (not the membership id). */
  userId: string;
  displayName: string;
  email: string | null;
  /** True when the member is a guest in the tenant. */
  isGuest: boolean;
}

/** A folder we can put plans in — a Team's Roadmaps folder, or OneDrive drafts. */
export interface GraphFolder {
  driveId: string;
  folderId: string;
}

export interface GraphPlanFile {
  driveId: string;
  itemId: string;
  name: string;
  eTag: string;
  webUrl?: string;
  lastModifiedIso: string;
  /** Display name of whoever last saved it, straight from the listing —
   *  no file-content read needed. */
  lastModifiedBy: string | null;
}

/** Item metadata used for freshness checks (cheap, $select-limited). */
export interface GraphItemMeta {
  eTag: string;
  lastModifiedIso: string;
  lastModifiedBy: string | null;
}

/** Thrown when a save is rejected because the item changed underneath us
 *  (HTTP 412 from an `If-Match` request). Carries who beat us to it. */
export class GraphConflictError extends Error {
  readonly meta: GraphItemMeta;

  constructor(meta: GraphItemMeta) {
    super('The file changed on the server since it was opened');
    this.name = 'GraphConflictError';
    this.meta = meta;
  }
}

export interface GraphApi {
  /** Teams the signed-in user belongs to. */
  listJoinedTeams(): Promise<GraphTeam[]>;
  /** Members of a Team, guests included. */
  listTeamMembers(teamId: string): Promise<GraphMember[]>;
  /** 48px profile photo as an object URL, or null when there isn't one. */
  getUserPhoto(userId: string): Promise<string | null>;

  /** The Team's Roadmaps folder, or null if it doesn't exist yet. */
  findRoadmapsFolder(teamId: string): Promise<GraphFolder | null>;
  /** The Team's Roadmaps folder, creating it if absent. */
  ensureRoadmapsFolder(teamId: string): Promise<GraphFolder>;
  /** The signed-in user's private drafts folder (OneDrive app folder). */
  getDraftsFolder(): Promise<GraphFolder>;

  /** `.json` plans in a folder, newest first. */
  listPlanFiles(folder: GraphFolder): Promise<GraphPlanFile[]>;
  downloadPlan(driveId: string, itemId: string): Promise<{ text: string; eTag: string }>;
  /** Save over an existing plan. Pass the eTag to guard against clobbering a
   *  newer version (throws GraphConflictError); pass null to force. */
  uploadPlan(driveId: string, itemId: string, text: string, eTag: string | null): Promise<{ eTag: string }>;
  createPlan(folder: GraphFolder, name: string, text: string): Promise<GraphPlanFile>;
  deletePlan(driveId: string, itemId: string): Promise<void>;
  getItemMeta(driveId: string, itemId: string): Promise<GraphItemMeta>;
}
