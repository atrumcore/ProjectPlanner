import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { useSectionedLanes } from '../hooks/useSectionedLanes';
import { sanitizeHtml } from '../utils/htmlSanitize';
import { htmlToPlainText } from '../utils/plainText';
import KeyFeaturesPopover from './KeyFeaturesPopover';
import { SWIMLANE_TINT_ALPHA } from '../types/gantt';
import { hexToRgba } from '../theme/colors';

/**
 * Rail tab for browsing and editing every project's Key Dependencies without
 * the on-canvas column (which is collapsed by default and only force-opens
 * for PNG/PDF export). Rows open the same rich-text popover the canvas
 * column uses, so editing behaviour is identical in both places.
 */
export default function DependenciesPanel() {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const updateSwimlane = useGanttStore(s => s.updateSwimlane);
  const sectionedLanes = useSectionedLanes(sections, swimlanes);

  const [popover, setPopover] = useState<{ laneId: string; anchor: DOMRect } | null>(null);

  if (swimlanes.length === 0) {
    return (
      <div className="teach-state">
        <span className="kicker">Key Dependencies</span>
        <p>Each project's external dependencies live here. Add a project first, then capture what it's waiting on.</p>
      </div>
    );
  }

  return (
    <div className="deps-panel">
      {sectionedLanes.map(({ section, lanes }) => (
        <div key={section.id} className="deps-panel-section">
          <div className="eyebrow deps-panel-section-label">{section.label}</div>
          {lanes.map(lane => {
            const html = sanitizeHtml(lane.keyDependencies);
            const tint = lane.color ? hexToRgba(lane.color, SWIMLANE_TINT_ALPHA) : 'transparent';
            return (
              <button
                key={lane.id}
                className="deps-panel-row"
                style={{ '--row-tint': tint } as CSSProperties}
                title="Click to edit dependencies"
                onClick={e => setPopover({
                  laneId: lane.id,
                  anchor: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                })}
              >
                <span className="deps-panel-project">
                  {htmlToPlainText(lane.projectName) || 'Untitled project'}
                </span>
                {html ? (
                  <span className="deps-panel-html" dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  <span className="deps-panel-empty">No dependencies — click to add</span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {popover && (() => {
        const lane = swimlanes.find(l => l.id === popover.laneId);
        if (!lane) return null;
        const plainName = htmlToPlainText(lane.projectName) || 'Untitled project';
        return (
          <KeyFeaturesPopover
            anchor={popover.anchor}
            projectName={plainName}
            title="Key dependencies"
            value={lane.keyDependencies}
            onSave={v => updateSwimlane(lane.id, { keyDependencies: v })}
            onClose={() => setPopover(null)}
          />
        );
      })()}
    </div>
  );
}
