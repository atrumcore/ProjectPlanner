// Display name used to attribute saves on shared plan files.
//
// This is per-browser (localStorage), NOT part of the plan document — it is an
// honour-system provenance label, not authentication. The real access boundary
// for a shared file is the file share's own permissions.

const NAME_KEY = 'dha-user-name';
const ASKED_KEY = 'dha-user-name-asked';

/** The stored display name, or null if unset. */
export function getUserName(): string | null {
  try {
    const v = localStorage.getItem(NAME_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setUserName(name: string): void {
  try {
    const v = name.trim();
    if (v) localStorage.setItem(NAME_KEY, v);
    else localStorage.removeItem(NAME_KEY);
    localStorage.setItem(ASKED_KEY, '1');
  } catch { /* ignore storage errors */ }
}

/** True if we've ever prompted for a name (even if the user skipped). Used to
 *  ask exactly once on first launch rather than nagging on every save. */
export function wasNameAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return true; // storage unavailable — never prompt
  }
}

export function markNameAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch { /* ignore */ }
}
