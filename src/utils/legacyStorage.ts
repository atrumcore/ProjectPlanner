// One-shot rename of localStorage keys carrying the old `dha-` prefix.
//
// (The assistant's single-key → provider-registry migration deliberately does
// NOT live here: the assistant store reads its registry at module scope, so a
// migration run from main.tsx would write storage the store had already read
// past. It sits in src/ai/providers.ts, on the read path itself.)
//
// The app was originally built for a single programme and prefixed its
// storage keys accordingly; it is now a generic planner. Renaming the keys
// would silently orphan every existing user's autosaved plan and settings, so
// on first load after the rename we copy each legacy key across and delete
// the original. Idempotent — once migrated there is nothing left to move.

const KEY_MAP: Array<[legacy: string, current: string]> = [
  ['dha-gantt-state', 'bbd-planner-state'],
  ['dha-theme', 'bbd-planner-theme'],
  ['dha-user-name', 'bbd-planner-user-name'],
  ['dha-user-name-asked', 'bbd-planner-user-name-asked'],
];

/**
 * Move any legacy `dha-*` values onto their current keys. Must run before
 * anything reads storage (theme resolution, store hydration).
 */
export function migrateLegacyStorageKeys(): void {
  try {
    for (const [legacy, current] of KEY_MAP) {
      const value = localStorage.getItem(legacy);
      if (value === null) continue;
      // Never clobber a value already written under the current key.
      if (localStorage.getItem(current) === null) {
        localStorage.setItem(current, value);
      }
      localStorage.removeItem(legacy);
    }
  } catch { /* storage unavailable — nothing to migrate */ }
}
