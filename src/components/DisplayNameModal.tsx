import { useState } from 'react';
import { getUserName, setUserName, markNameAsked } from '../utils/userName';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface Props {
  onClose: () => void;
}

/**
 * One-time (or File-menu-invoked) prompt for the display name stamped into
 * saved plan files, so teammates on a shared drive can see who last saved.
 * Stored per-browser; skipping is fine — saves are then unattributed.
 *
 * Only the explicit Skip button suppresses the prompt permanently. Dismissing
 * via Escape or the backdrop just closes it — an accidental click must not
 * opt the user out of attribution forever.
 */
export default function DisplayNameModal({ onClose }: Props) {
  const [name, setName] = useState(getUserName() ?? '');
  const dialogProps = useModalDismiss(onClose);

  const save = () => {
    setUserName(name);
    onClose();
  };

  const skip = () => {
    markNameAsked();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} {...dialogProps}>
        <h2>Your name for shared plans</h2>
        <p className="modal-copy">
          When you save a plan file, your name is stamped into it so teammates
          on a shared drive can see who last saved. Stored only in this
          browser — leave blank to stay unattributed.
        </p>
        <label>Display name</label>
        <input
          autoFocus
          value={name}
          placeholder="e.g. Streicher"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
          }}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={skip} title="Don't ask again on this browser">Skip</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
