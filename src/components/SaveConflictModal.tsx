import { useGanttStore } from '../store/useGanttStore';
import { formatSavedAt } from '../utils/dateUtils';

/**
 * Shown when Save found the file changed on disk since this session's
 * baseline — i.e. another editor saved in between. Forces an explicit choice
 * so nobody's work is silently clobbered.
 */
export default function SaveConflictModal() {
  const saveConflict = useGanttStore(s => s.saveConflict);
  const saveFile = useGanttStore(s => s.saveFile);
  const saveFileAs = useGanttStore(s => s.saveFileAs);
  const reloadFromDisk = useGanttStore(s => s.reloadFromDisk);
  const clearSaveConflict = useGanttStore(s => s.clearSaveConflict);

  if (!saveConflict) return null;

  const who = saveConflict.savedBy || 'Another editor';
  const when = formatSavedAt(saveConflict.savedAtIso);

  return (
    <div className="modal-overlay" onClick={clearSaveConflict}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>File changed on disk</h2>
        <p className="save-conflict-text">
          <strong>{who}</strong> saved this file{when ? ` at ${when}` : ''}, after you opened it.
          Saving now would overwrite their changes.
        </p>
        <div className="save-conflict-actions">
          <button
            className="btn-primary"
            onClick={async () => {
              clearSaveConflict();
              await saveFileAs();
            }}
            title="Keep both versions — save yours to a new file"
          >
            Save as a copy
          </button>
          <button
            className="btn-secondary"
            onClick={() => reloadFromDisk()}
            title="Load their version — your unsaved changes are discarded"
          >
            Discard mine &amp; reload theirs
          </button>
          <button
            className="btn-secondary save-conflict-overwrite"
            onClick={() => saveFile({ force: true })}
            title="Write your version over theirs"
          >
            Overwrite their changes
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={clearSaveConflict}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
