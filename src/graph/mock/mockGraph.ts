// In-memory stand-in for Microsoft Graph, used when VITE_GRAPH_MOCK=1.
//
// Lets the whole signed-in experience be built and tested without a tenant or
// an app registration. Deliberately deterministic so browser tests can assert
// exact contents, with `window.__graphMock` controls for forcing the awkward
// cases (save conflicts, someone-else-saved) that are hard to stage for real.

import {
  GraphConflictError,
  type GraphApi,
  type GraphFolder,
  type GraphItemMeta,
  type GraphMember,
  type GraphPlanFile,
  type GraphTeam,
} from '../types';

interface MockItem {
  driveId: string;
  itemId: string;
  parentId: string;
  name: string;
  content: string;
  eTagCounter: number;
  lastModifiedIso: string;
  lastModifiedBy: string | null;
}

interface MockTeam extends GraphTeam {
  driveId: string;
  generalFolderId: string;
  /** null until a Roadmaps folder is created — one team starts without one. */
  roadmapsFolderId: string | null;
  members: GraphMember[];
}

const MOCK_USER = 'Mock User';
const DRAFTS_DRIVE = 'drive-me';
const DRAFTS_FOLDER = 'folder-approot';

const eTagOf = (item: MockItem) => `"mock-etag-${item.itemId}-${item.eTagCounter}"`;

function seedPlan(swimlaneName: string): string {
  return JSON.stringify({
    sections: [{ id: 'in-progress', label: 'In Progress', order: 0 }],
    swimlanes: [{
      id: `lane-${swimlaneName.toLowerCase().replace(/\s+/g, '-')}`,
      projectName: swimlaneName,
      keyFeatures: '', keyDependencies: '', section: 'in-progress', order: 0,
      assigneeIds: [], teamIds: [],
    }],
    phaseBars: [], milestones: [], dependencies: [], actionItems: [],
    floatingNotes: [], environments: [], teams: [], people: [],
    timeline: { startMonth: 0, startYear: 2026, totalWeeks: 35, weekWidthPx: 36 },
    meta: { savedBy: 'Alice Dlamini', savedAtIso: '2026-08-01T09:12:00.000Z' },
    calendarModelVersion: 7,
  }, null, 2);
}

interface MockState {
  teams: MockTeam[];
  items: Map<string, MockItem>;
  /** Forces the next uploadPlan to fail with this status (e.g. 412). */
  failNextPut: number | null;
  latencyMs: number;
  nextId: number;
}

function buildState(): MockState {
  const teams: MockTeam[] = [
    {
      id: 'team-dc', displayName: 'Digital Channels',
      driveId: 'drive-dc', generalFolderId: 'folder-dc-general', roadmapsFolderId: 'folder-dc-roadmaps',
      members: [
        { userId: 'u-alice', displayName: 'Alice Dlamini', email: 'alice@example.com', isGuest: false },
        { userId: 'u-bob', displayName: 'Bob Nkosi', email: 'bob@example.com', isGuest: false },
        // No photo for this one — exercises the initials fallback.
        { userId: 'u-carol', displayName: 'Carol Meyer', email: 'carol@example.com', isGuest: false },
        { userId: 'u-dan', displayName: 'Dan Visser', email: 'dan@partner.example', isGuest: true },
      ],
    },
    {
      id: 'team-platform', displayName: 'Platform Engineering',
      driveId: 'drive-platform', generalFolderId: 'folder-platform-general',
      // Starts without a Roadmaps folder — exercises lazy creation.
      roadmapsFolderId: null,
      members: [
        { userId: 'u-erin', displayName: 'Erin Botha', email: 'erin@example.com', isGuest: false },
        { userId: 'u-alice', displayName: 'Alice Dlamini', email: 'alice@example.com', isGuest: false },
      ],
    },
    {
      id: 'team-data', displayName: 'Data & Insights',
      driveId: 'drive-data', generalFolderId: 'folder-data-general', roadmapsFolderId: 'folder-data-roadmaps',
      members: [
        { userId: 'u-frank', displayName: 'Frank Adams', email: 'frank@example.com', isGuest: false },
      ],
    },
  ];

  const items = new Map<string, MockItem>();
  const addPlan = (driveId: string, parentId: string, itemId: string, name: string, lane: string, by: string, iso: string) => {
    items.set(itemId, {
      driveId, parentId, itemId, name, content: seedPlan(lane),
      eTagCounter: 1, lastModifiedIso: iso, lastModifiedBy: by,
    });
  };
  addPlan('drive-dc', 'folder-dc-roadmaps', 'item-plan-1', '2026 Priority Roadmap.json', 'Channel Modernisation', 'Alice Dlamini', '2026-08-06T09:12:00.000Z');
  addPlan('drive-dc', 'folder-dc-roadmaps', 'item-plan-2', 'Modernisation wave 2.json', 'Wave 2 Delivery', MOCK_USER, '2026-08-05T16:40:00.000Z');
  addPlan('drive-data', 'folder-data-roadmaps', 'item-plan-3', 'Reporting rebuild.json', 'Reporting Rebuild', 'Frank Adams', '2026-07-28T11:05:00.000Z');
  addPlan(DRAFTS_DRIVE, DRAFTS_FOLDER, 'item-draft-1', 'Draft - API consolidation.json', 'API Consolidation', MOCK_USER, '2026-08-04T08:00:00.000Z');

  return { teams, items, failNextPut: null, latencyMs: 180, nextId: 100 };
}

let state = buildState();

const delay = () => new Promise<void>(resolve => setTimeout(resolve, state.latencyMs));

function findTeam(teamId: string): MockTeam {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) throw new Error(`Mock: unknown team ${teamId}`);
  return team;
}

function metaOf(item: MockItem): GraphItemMeta {
  return { eTag: eTagOf(item), lastModifiedIso: item.lastModifiedIso, lastModifiedBy: item.lastModifiedBy };
}

function fileOf(item: MockItem): GraphPlanFile {
  return {
    driveId: item.driveId, itemId: item.itemId, name: item.name, eTag: eTagOf(item),
    webUrl: `https://mock.sharepoint.example/${item.itemId}`,
    lastModifiedIso: item.lastModifiedIso, lastModifiedBy: item.lastModifiedBy,
  };
}

export const mockGraphApi: GraphApi = {
  async listJoinedTeams() {
    await delay();
    return state.teams.map(({ id, displayName }) => ({ id, displayName }));
  },

  async listTeamMembers(teamId) {
    await delay();
    return [...findTeam(teamId).members];
  },

  async getUserPhoto(userId) {
    await delay();
    // Carol deliberately has no photo, so the initials fallback gets exercised.
    if (userId === 'u-carol') return null;
    // A tiny inline SVG stands in for a real photo blob.
    const hue = [...userId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="hsl(${hue},55%,45%)"/></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  },

  async findRoadmapsFolder(teamId) {
    await delay();
    const team = findTeam(teamId);
    return team.roadmapsFolderId ? { driveId: team.driveId, folderId: team.roadmapsFolderId } : null;
  },

  async ensureRoadmapsFolder(teamId) {
    await delay();
    const team = findTeam(teamId);
    if (!team.roadmapsFolderId) team.roadmapsFolderId = `folder-${team.id}-roadmaps`;
    return { driveId: team.driveId, folderId: team.roadmapsFolderId };
  },

  async getDraftsFolder() {
    await delay();
    return { driveId: DRAFTS_DRIVE, folderId: DRAFTS_FOLDER };
  },

  async listPlanFiles(folder: GraphFolder) {
    await delay();
    return [...state.items.values()]
      .filter(i => i.driveId === folder.driveId && i.parentId === folder.folderId)
      .sort((a, b) => b.lastModifiedIso.localeCompare(a.lastModifiedIso))
      .map(fileOf);
  },

  async downloadPlan(_driveId, itemId) {
    await delay();
    const item = state.items.get(itemId);
    if (!item) throw new Error('Mock: plan not found');
    return { text: item.content, eTag: eTagOf(item) };
  },

  async uploadPlan(_driveId, itemId, text, eTag) {
    await delay();
    const item = state.items.get(itemId);
    if (!item) throw new Error('Mock: plan not found');

    if (state.failNextPut !== null) {
      const status = state.failNextPut;
      state.failNextPut = null;
      if (status === 412) {
        // Pretend someone else saved just before us.
        item.eTagCounter += 1;
        item.lastModifiedBy = 'Bob Nkosi';
        item.lastModifiedIso = new Date().toISOString();
        throw new GraphConflictError(metaOf(item));
      }
      throw new Error(`Mock: forced failure ${status}`);
    }

    if (eTag && eTag !== eTagOf(item)) throw new GraphConflictError(metaOf(item));

    item.content = text;
    item.eTagCounter += 1;
    item.lastModifiedBy = MOCK_USER;
    item.lastModifiedIso = new Date().toISOString();
    return { eTag: eTagOf(item) };
  },

  async createPlan(folder, name, text) {
    await delay();
    const fileName = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
    const itemId = `item-new-${state.nextId++}`;
    const item: MockItem = {
      driveId: folder.driveId, parentId: folder.folderId, itemId, name: fileName,
      content: text, eTagCounter: 1,
      lastModifiedIso: new Date().toISOString(), lastModifiedBy: MOCK_USER,
    };
    state.items.set(itemId, item);
    return fileOf(item);
  },

  async deletePlan(_driveId, itemId) {
    await delay();
    state.items.delete(itemId);
  },

  async getItemMeta(_driveId, itemId) {
    await delay();
    const item = state.items.get(itemId);
    if (!item) throw new Error('Mock: plan not found');
    return metaOf(item);
  },
};

/** Test hooks, dev only — mirrors the existing window.__ganttStore pattern. */
export function installMockGraphControls(): void {
  (window as unknown as { __graphMock?: unknown }).__graphMock = {
    reset: () => { state = buildState(); },
    /** Force the next save to fail; 412 simulates "someone else saved first". */
    failNextPut: (status = 412) => { state.failNextPut = status; },
    /** Simulate another editor saving, so the freshness banner appears. */
    bumpEtag: (itemId: string, by = 'Bob Nkosi') => {
      const item = state.items.get(itemId);
      if (!item) return false;
      item.eTagCounter += 1;
      item.lastModifiedBy = by;
      item.lastModifiedIso = new Date().toISOString();
      return true;
    },
    setLatency: (ms: number) => { state.latencyMs = ms; },
    listItems: () => [...state.items.values()].map(i => ({ itemId: i.itemId, name: i.name, eTag: eTagOf(i) })),
  };
}
