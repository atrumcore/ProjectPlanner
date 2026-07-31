import { useState } from 'react';
import { getUserName, setUserName, markNameAsked } from '../utils/userName';

interface Props {
  onClose: () => void;
}

/**
 * One-time (or File-menu-invoked) prompt for the display name stamped into
 * saved plan files, so teammates on a shared drive can see who last saved.
 * Stored per-browser; skipping is fine — saves are then unattributed.
 */
export default function DisplayNameModal({ onClose }: Props) {
  const [name, setName] = useState(getUserName() ?? '');

  const save = () => {
    setUserName(name);
    onClose();
  };

  const skip = () => {
    markNameAsked();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={skip}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Your name for shared plans</h2>
        <p className="display-name-text">
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
            if (e.key === 'Escape') skip();
          }}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={skip}>Skip</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
