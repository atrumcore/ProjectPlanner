/**
 * Inspector tab — placeholder until the selection model lands (next phase).
 * Uses the shared teach-state pattern so all four tabs speak one language.
 */
export default function InspectorTab() {
  return (
    <div className="teach-state">
      <div className="kicker">Inspector</div>
      <p>
        Select a bar, lane or section on the canvas and edit its properties
        here — one place instead of scattered menus.
      </p>
      <p className="teach-state-note">
        Coming in the next update. Right-click and double-click still work
        exactly as before.
      </p>
    </div>
  );
}
