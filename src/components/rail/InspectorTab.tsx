/**
 * Inspector tab — R1 placeholder. The full Inspector (plan overview, bar,
 * lane and section states) lands in the next redesign phase; this teach state
 * keeps the tab honest until then.
 */
export default function InspectorTab() {
  return (
    <div className="inspector-placeholder">
      <div className="kicker">Inspector</div>
      <p>
        Select a bar, lane or section on the canvas and edit its properties
        here — one place instead of scattered menus.
      </p>
      <p className="inspector-placeholder-note">
        Coming in the next update. Right-click and double-click still work
        exactly as before.
      </p>
    </div>
  );
}
