import { create } from 'zustand';
import {
  isAuthAvailable,
  isMockMode,
  msalReady,
  signInRedirect,
  signOutRedirect,
  type AuthAccount,
} from './msal';

/** Fake identity used when VITE_GRAPH_MOCK=1, so the whole signed-in UI is
 *  buildable and testable before the Entra app registration exists. */
const MOCK_ACCOUNT: AuthAccount = {
  id: 'mock-oid-0001',
  name: 'Mock User',
  email: 'mock.user@example.com',
};

const MOCK_SESSION_KEY = 'bbd-planner-mock-signed-in';

/** After a fresh sign-in, land on the launcher so the user can pick a plan.
 *  Restoring an existing session (initAuth) deliberately doesn't do this — a
 *  page refresh should leave you where you were working. Imported lazily to
 *  keep the auth store free of a hard dependency on the document store. */
function showLauncher(): void {
  void import('../store/useGanttStore').then(({ useGanttStore }) => {
    useGanttStore.getState().setAppView('launcher');
  });
}

interface AuthState {
  /** Whether a sign-in path exists at all (real registration or mock mode). */
  available: boolean;
  account: AuthAccount | null;
  /** True while a redirect sign-in/out is in flight. */
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  available: isAuthAvailable,
  account: null,
  busy: false,

  signIn: async () => {
    if (isMockMode) {
      try { sessionStorage.setItem(MOCK_SESSION_KEY, '1'); } catch { /* ignore */ }
      set({ account: MOCK_ACCOUNT });
      showLauncher();
      return;
    }
    set({ busy: true });
    try {
      await signInRedirect();
    } catch (e) {
      console.error('[auth] sign-in failed:', e);
      set({ busy: false });
    }
  },

  signOut: async () => {
    if (isMockMode) {
      try { sessionStorage.removeItem(MOCK_SESSION_KEY); } catch { /* ignore */ }
      set({ account: null });
      return;
    }
    set({ busy: true });
    try {
      await signOutRedirect();
    } catch (e) {
      console.error('[auth] sign-out failed:', e);
      set({ busy: false });
    }
  },
}));

/**
 * Initialise auth before the app renders. Consumes any MSAL redirect response
 * and restores an existing session. Returns once auth state is settled.
 */
export async function initAuth(): Promise<void> {
  if (isMockMode) {
    let signedIn = false;
    try { signedIn = sessionStorage.getItem(MOCK_SESSION_KEY) === '1'; } catch { /* ignore */ }
    useAuthStore.setState({ account: signedIn ? MOCK_ACCOUNT : null });
    return;
  }
  const account = await msalReady();
  useAuthStore.setState({ account });
}
