import { useGanttStore } from '../store/useGanttStore';
import { formatSavedAt } from '../utils/dateUtils';

/**
 * Non-blocking banner shown when the open plan file changed on disk (someone
 * else saved it). Offers a reload or an explicit "keep mine" dismissal — the
 * overwrite guard in saveFile still protects the other editor's work if the
 * user keeps editing.
 */
export default function FileUpdateBanner() {
  const externalUpdate = useGanttStore(s => s.externalUpdate);
  const isDirty = useGanttStore(s => s.isDirty);
  const reloadFromDisk = useGanttStore(s => s.reloadFromDisk);
  const dismissExternalUpdate = useGanttStore(s => s.dismissExternalUpdate);

  if (!externalUpdate) return null;

  const who = externalUpdate.savedBy || 'another editor';
  const when = formatSavedAt(externalUpdate.savedAtIso);

  return (
    <div className="file-update-banner" role="status">
      <span className="file-update-banner-text">
        Plan updated on disk by <strong>{who}</strong>{when ? ` · ${when}` : ''}
      </span>
      <button
        className="file-update-banner-reload"
        onClick={reloadFromDisk}
        title={isDirty ? 'Load their version — your unsaved changes are discarded' : 'Load their version'}
      >
        Reload{isDirty ? ' (discards your changes)' : ''}
      </button>
      <button
        className="file-update-banner-dismiss"
        onClick={dismissExternalUpdate}
        title="Keep working on your version. Saving will still warn before overwriting theirs."
      >
        Keep mine
      </button>
    </div>
  );
}
