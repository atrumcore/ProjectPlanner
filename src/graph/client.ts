// Authenticated fetch against Microsoft Graph.
//
// Handles the three things every call needs: a fresh access token, a single
// retry when the token turns out to be stale (401), and backing off when
// Graph throttles us (429/503). 412 is deliberately passed through — callers
// treat it as a save conflict, not an error to retry.

import { getAccessToken } from '../auth/msal';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_THROTTLE_RETRIES = 2;

export class GraphError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = 'GraphError';
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Seconds from a Retry-After header, with a sane cap and jittered fallback. */
function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get('Retry-After');
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  // Exponential backoff with jitter when Graph doesn't tell us.
  return Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
}

/**
 * Fetch a Graph path (e.g. `/me/joinedTeams`). Returns the raw Response so
 * callers can read JSON, text, or a blob as needed.
 */
export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;

  const send = async (token: string): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };

  let token = await getAccessToken();
  let response = await send(token);

  // A cached token can be rejected if it was revoked or expired early.
  if (response.status === 401) {
    token = await getAccessToken(true);
    response = await send(token);
  }

  for (let attempt = 0; attempt < MAX_THROTTLE_RETRIES; attempt++) {
    if (response.status !== 429 && response.status !== 503) break;
    await sleep(retryDelayMs(response, attempt));
    response = await send(token);
  }

  return response;
}

/** graphFetch + JSON, throwing GraphError on failure. 412 passes through so
 *  callers can convert it into a save conflict. */
export async function graphJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await graphFetch(path, init);
  if (!response.ok) {
    throw new GraphError(response.status, `Graph ${response.status} for ${path}`, await safeText(response));
  }
  return response.status === 204 ? (undefined as T) : (await response.json()) as T;
}

export async function safeText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
