// Microsoft Graph operations the app needs, expressed in app terms.
//
// Storage layout: each Team gets one `Roadmaps` folder inside its General
// channel's files (which is really a SharePoint document library), created
// lazily the first time someone saves a plan there. Personal drafts live in
// the user's OneDrive app folder.

import { graphFetch, graphJson, GraphError, safeText } from './client';
import {
  GraphConflictError,
  type GraphApi,
  type GraphFolder,
  type GraphItemMeta,
  type GraphMember,
  type GraphPlanFile,
  type GraphTeam,
} from './types';

const ROADMAPS_FOLDER = 'Roadmaps';

interface DriveItemDto {
  id: string;
  name: string;
  eTag?: string;
  cTag?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  folder?: unknown;
  parentReference?: { driveId?: string };
}

function toPlanFile(item: DriveItemDto, driveId: string): GraphPlanFile {
  return {
    driveId: item.parentReference?.driveId ?? driveId,
    itemId: item.id,
    name: item.name,
    eTag: item.eTag ?? item.cTag ?? '',
    webUrl: item.webUrl,
    lastModifiedIso: item.lastModifiedDateTime ?? '',
    lastModifiedBy: item.lastModifiedBy?.user?.displayName ?? null,
  };
}

function toItemMeta(item: DriveItemDto): GraphItemMeta {
  return {
    eTag: item.eTag ?? item.cTag ?? '',
    lastModifiedIso: item.lastModifiedDateTime ?? '',
    lastModifiedBy: item.lastModifiedBy?.user?.displayName ?? null,
  };
}

/** The General channel's files folder — the root we hang Roadmaps off. */
async function getGeneralFolder(teamId: string): Promise<{ driveId: string; folderId: string }> {
  try {
    const item = await graphJson<DriveItemDto>(
      `/teams/${teamId}/primaryChannel/filesFolder?$select=id,parentReference`
    );
    const driveId = item.parentReference?.driveId;
    if (!driveId) throw new Error('No driveId on the channel files folder');
    return { driveId, folderId: item.id };
  } catch (e) {
    // A newly created Team can 404 here while SharePoint finishes provisioning.
    if (e instanceof GraphError && e.status === 404) {
      throw new Error(
        'This Team\'s file storage is still being set up by SharePoint. Try again in a minute.'
      );
    }
    throw e;
  }
}

export const graphApi: GraphApi = {
  async listJoinedTeams(): Promise<GraphTeam[]> {
    const data = await graphJson<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
      '/me/joinedTeams?$select=id,displayName,description'
    );
    return (data.value ?? [])
      .map(t => ({ id: t.id, displayName: t.displayName, description: t.description }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  async listTeamMembers(teamId: string): Promise<GraphMember[]> {
    const data = await graphJson<{
      value: Array<{ userId?: string; displayName?: string; email?: string; roles?: string[] }>;
    }>(`/teams/${teamId}/members`);
    return (data.value ?? [])
      .filter(m => !!m.userId)
      .map(m => ({
        userId: m.userId!,
        displayName: m.displayName ?? 'Unknown',
        email: m.email ?? null,
        isGuest: (m.roles ?? []).includes('guest'),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  async getUserPhoto(userId: string): Promise<string | null> {
    try {
      const response = await graphFetch(`/users/${userId}/photos/48x48/$value`);
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch {
      return null;
    }
  },

  async findRoadmapsFolder(teamId: string): Promise<GraphFolder | null> {
    const { driveId, folderId } = await getGeneralFolder(teamId);
    const data = await graphJson<{ value: DriveItemDto[] }>(
      `/drives/${driveId}/items/${folderId}/children?$select=id,name,folder`
    );
    const found = (data.value ?? []).find(i => i.folder && i.name === ROADMAPS_FOLDER);
    return found ? { driveId, folderId: found.id } : null;
  },

  async ensureRoadmapsFolder(teamId: string): Promise<GraphFolder> {
    const existing = await graphApi.findRoadmapsFolder(teamId);
    if (existing) return existing;

    const { driveId, folderId } = await getGeneralFolder(teamId);
    try {
      const created = await graphJson<DriveItemDto>(`/drives/${driveId}/items/${folderId}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ROADMAPS_FOLDER,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      });
      return { driveId, folderId: created.id };
    } catch (e) {
      // Someone else created it between our check and our POST.
      if (e instanceof GraphError && e.status === 409) {
        const raced = await graphApi.findRoadmapsFolder(teamId);
        if (raced) return raced;
      }
      throw e;
    }
  },

  async getDraftsFolder(): Promise<GraphFolder> {
    // `special/approot` auto-creates Apps/<app registration name> on first use.
    const item = await graphJson<DriveItemDto>('/me/drive/special/approot?$select=id,parentReference');
    const driveId = item.parentReference?.driveId;
    if (!driveId) throw new Error('No driveId on the OneDrive app folder');
    return { driveId, folderId: item.id };
  },

  async listPlanFiles(folder: GraphFolder): Promise<GraphPlanFile[]> {
    const select = 'id,name,eTag,cTag,webUrl,lastModifiedDateTime,lastModifiedBy,folder,parentReference';
    const data = await graphJson<{ value: DriveItemDto[] }>(
      `/drives/${folder.driveId}/items/${folder.folderId}/children?$select=${select}&$orderby=lastModifiedDateTime desc`
    );
    return (data.value ?? [])
      .filter(i => !i.folder && i.name.toLowerCase().endsWith('.json'))
      .map(i => toPlanFile(i, folder.driveId));
  },

  async downloadPlan(driveId: string, itemId: string): Promise<{ text: string; eTag: string }> {
    const meta = await graphApi.getItemMeta(driveId, itemId);
    const response = await graphFetch(`/drives/${driveId}/items/${itemId}/content`);
    if (!response.ok) {
      throw new GraphError(response.status, `Could not download plan (${response.status})`, await safeText(response));
    }
    return { text: await response.text(), eTag: meta.eTag };
  },

  async uploadPlan(driveId, itemId, text, eTag): Promise<{ eTag: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Omitting If-Match is how the conflict dialog's "overwrite" works.
    if (eTag) headers['If-Match'] = eTag;

    const response = await graphFetch(`/drives/${driveId}/items/${itemId}/content`, {
      method: 'PUT',
      headers,
      body: text,
    });

    if (response.status === 412) {
      throw new GraphConflictError(await graphApi.getItemMeta(driveId, itemId));
    }
    if (!response.ok) {
      throw new GraphError(response.status, `Save failed (${response.status})`, await safeText(response));
    }
    const item = (await response.json()) as DriveItemDto;
    return { eTag: item.eTag ?? item.cTag ?? '' };
  },

  async createPlan(folder: GraphFolder, name: string, text: string): Promise<GraphPlanFile> {
    const fileName = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
    // `:/content` with conflictBehavior=rename avoids stomping a same-named plan.
    const path = `/drives/${folder.driveId}/items/${folder.folderId}:/${encodeURIComponent(fileName)}:/content?@microsoft.graph.conflictBehavior=rename`;
    const response = await graphFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    });
    if (!response.ok) {
      throw new GraphError(response.status, `Could not create plan (${response.status})`, await safeText(response));
    }
    return toPlanFile((await response.json()) as DriveItemDto, folder.driveId);
  },

  async deletePlan(driveId: string, itemId: string): Promise<void> {
    const response = await graphFetch(`/drives/${driveId}/items/${itemId}`, { method: 'DELETE' });
    // 404 means it's already gone — that's the outcome we wanted.
    if (!response.ok && response.status !== 404) {
      throw new GraphError(response.status, `Delete failed (${response.status})`, await safeText(response));
    }
  },

  async getItemMeta(driveId: string, itemId: string): Promise<GraphItemMeta> {
    const item = await graphJson<DriveItemDto>(
      `/drives/${driveId}/items/${itemId}?$select=eTag,cTag,lastModifiedDateTime,lastModifiedBy`
    );
    return toItemMeta(item);
  },
};
