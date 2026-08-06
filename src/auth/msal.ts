// MSAL wrapper — Entra ID sign-in for the shared-plan (Microsoft 365) mode.
//
// Sign-in is entirely OPTIONAL: with no client ID configured (or in mock
// mode) the app behaves exactly as it did before M365 support, storing plans
// in local files. `msalReady()` must be awaited before React renders so a
// redirect response in the URL hash is consumed before anything paints.

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
} from '@azure/msal-browser';

/** Signed-in identity, normalised away from MSAL's AccountInfo shape. */
export interface AuthAccount {
  /** Entra object id (oid) — stable per user per tenant. */
  id: string;
  name: string;
  email: string | null;
}

/** Delegated scopes requested at sign-in. Mirrors docs/it-request-m365.md. */
export const GRAPH_SCOPES = [
  'User.Read',
  'Team.ReadBasic.All',
  'TeamMember.Read.All',
  'User.ReadBasic.All',
  'Files.ReadWrite.All',
];

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID?.trim() || '';
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID?.trim() || 'organizations';

/** True when mock mode replaces real Microsoft calls (dev/testing only). */
export const isMockMode = import.meta.env.DEV && import.meta.env.VITE_GRAPH_MOCK === '1';

/** True when real Entra sign-in is available (an app registration is wired up). */
export const isAuthConfigured = clientId.length > 0 && !isMockMode;

/** True when any sign-in path exists at all — real or mocked. */
export const isAuthAvailable = isAuthConfigured || isMockMode;

const config: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    // sessionStorage over localStorage: smaller theft surface, and a new tab
    // re-authenticates silently against the Entra session cookie anyway.
    cacheLocation: 'sessionStorage',
  },
};

let instance: PublicClientApplication | null = null;

/** The MSAL instance, or null when sign-in isn't configured. */
export function getMsal(): PublicClientApplication | null {
  return instance;
}

function toAccount(a: AccountInfo): AuthAccount {
  const claims = a.idTokenClaims as { oid?: string; email?: string } | undefined;
  return {
    id: claims?.oid ?? a.localAccountId ?? a.homeAccountId,
    name: a.name || a.username || 'Signed in',
    email: a.username || claims?.email || null,
  };
}

/**
 * Initialise MSAL and consume any redirect response. Resolves to the account
 * that is signed in (from a just-completed redirect or a cached session), or
 * null. Safe — and near-instant — to call when auth isn't configured.
 */
export async function msalReady(): Promise<AuthAccount | null> {
  if (!isAuthConfigured) return null;
  try {
    instance = new PublicClientApplication(config);
    await instance.initialize();
    const result: AuthenticationResult | null = await instance.handleRedirectPromise();
    const account = result?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
    if (account) instance.setActiveAccount(account);
    return account ? toAccount(account) : null;
  } catch (e) {
    // A broken auth config must never take the whole app down — fall back to
    // the signed-out (local-file) experience.
    console.error('[auth] MSAL initialisation failed; continuing signed out:', e);
    instance = null;
    return null;
  }
}

/** Start an interactive sign-in (full-page redirect). */
export async function signInRedirect(): Promise<void> {
  if (!instance) return;
  await instance.loginRedirect({ scopes: GRAPH_SCOPES });
}

/** Sign out and clear the cached session. */
export async function signOutRedirect(): Promise<void> {
  if (!instance) return;
  await instance.logoutRedirect({ account: instance.getActiveAccount() ?? undefined });
}

/**
 * Acquire a Graph access token, falling back to an interactive redirect when
 * silent renewal isn't possible (consent required, session expired, …).
 * Throws when signed out — callers should check auth state first.
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!instance) throw new Error('Not signed in');
  const account = instance.getActiveAccount();
  if (!account) throw new Error('Not signed in');
  try {
    const result = await instance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account, forceRefresh });
    return result.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account });
      // Redirect navigates away; this never resolves in practice.
      throw e;
    }
    throw e;
  }
}
