import { useGanttStore } from '../store/useGanttStore';
import { formatSavedAt } from '../utils/dateUtils';
import { useModalDismiss } from '../hooks/useModalDismiss';

/**
 * Shown when Save found the file changed on disk since this session's
 * baseline — i.e. another editor saved in between. Forces an explicit choice
 * so nobody's work is silently clobbered. Three stacked outcomes, safest
 * first; Cancel is a quiet text link (v2 dialogs card).
 *
 * Split into gate + dialog so the Escape listener only exists while the
 * dialog is actually showing (it captures + stops propagation, which must
 * never eat the canvas Escape cascade when no conflict is up).
 */
export default function SaveConflictModal() {
  const saveConflict = useGanttStore(s => s.saveConflict);
  if (!saveConflict) return null;
  return <SaveConflictDialog />;
}

function SaveConflictDialog() {
  const saveConflict = useGanttStore(s => s.saveConflict);
  const saveFile = useGanttStore(s => s.saveFile);
  const saveFileAs = useGanttStore(s => s.saveFileAs);
  const reloadFromDisk = useGanttStore(s => s.reloadFromDisk);
  const clearSaveConflict = useGanttStore(s => s.clearSaveConflict);
  const dialogProps = useModalDismiss(clearSaveConflict);

  if (!saveConflict) return null;

  const who = saveConflict.savedBy || 'Another editor';
  const when = formatSavedAt(saveConflict.savedAtIso);

  return (
    <div className="modal-overlay" onClick={clearSaveConflict}>
      <div className="modal" onClick={e => e.stopPropagation()} {...dialogProps}>
        <h2>File changed on disk</h2>
        <p className="modal-copy">
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
            className="btn-danger"
            onClick={() => saveFile({ force: true })}
            title="Write your version over theirs"
          >
            Overwrite their changes
          </button>
        </div>
        <div className="modal-actions">
          <button className="modal-cancel-link" onClick={clearSaveConflict}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
