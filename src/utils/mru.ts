// Recently-opened plans, so the launcher can offer "carry on where you were".
//
// Only Microsoft 365 plans are remembered — local files are opened through a
// FileSystemFileHandle, which can't be serialised to localStorage.

import type { PlanRef, PlanSource } from '../types/planSource';
import { planSourceToRef } from '../types/planSource';

const MRU_KEY = 'bbd-planner-recent';
const MAX_ENTRIES = 8;

export function getRecentPlans(): PlanRef[] {
  try {
    const raw = localStorage.getItem(MRU_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PlanRef =>
        !!p && typeof p.driveId === 'string' && typeof p.itemId === 'string' && typeof p.name === 'string'
    );
  } catch {
    return [];
  }
}

/** Record a plan as most-recently-opened, de-duplicating by item id. */
export function rememberPlan(source: PlanSource): void {
  const ref = planSourceToRef(source);
  if (!ref) return;
  try {
    const next = [ref, ...getRecentPlans().filter(p => p.itemId !== ref.itemId)].slice(0, MAX_ENTRIES);
    localStorage.setItem(MRU_KEY, JSON.stringify(next));
  } catch { /* storage unavailable — recents are a convenience, not critical */ }
}

/** Drop a plan from the list (e.g. after it's deleted). */
export function forgetPlan(itemId: string): void {
  try {
    localStorage.setItem(MRU_KEY, JSON.stringify(getRecentPlans().filter(p => p.itemId !== itemId)));
  } catch { /* ignore */ }
}
