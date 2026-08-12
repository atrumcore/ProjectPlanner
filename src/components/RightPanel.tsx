import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import { useGanttStore, dependenciesHtmlForSwimlane } from '../store/useGanttStore';
import type { Swimlane } from '../types/gantt';
import { SWIMLANE_TINT_ALPHA } from '../types/gantt';
import { hexToRgba } from '../theme/colors';
import { useSectionedLanes } from '../hooks/useSectionedLanes';
import FeaturesCell from './FeaturesCell';

interface Props {
  onScroll: (scrollTop: number) => void;
  width: number;
}

/**
 * The Key Dependencies column — EXPORT ONLY (mounted by GanttChart while
 * `isExporting`). Reading and editing happen in the rail tab; this exists so
 * an exported PNG/PDF still carries each project's dependencies for readers
 * who only ever see the picture.
 *
 * Text is derived from the shared `dependencyItems` (a dependency blocking
 * three projects appears on all three rows), so there is nothing to edit here
 * and no popover.
 */
const RightPanel = forwardRef<HTMLDivElement, Props>(({ onScroll, width }, ref) => {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const dependencyItems = useGanttStore(s => s.dependencyItems);

  const sectionedLanes = useSectionedLanes(sections, swimlanes);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll((e.target as HTMLDivElement).scrollTop);
  };

  const renderCell = (lane: Swimlane, index: number) => {
    // Match the left panel: a tinted row uses a flat base (no even/odd striping)
    // so adjacent coloured rows don't darken; untinted rows keep the stripe.
    // Exposed as CSS variables so the overflow fade blends into the same
    // composited colour, mirroring the Key Features cells.
    const baseBg = lane.color
      ? 'var(--bg-row-even)'
      : index % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)';
    const tint = lane.color ? hexToRgba(lane.color, SWIMLANE_TINT_ALPHA) : 'transparent';
    const cellStyle: Record<string, string> = {
      '--row-base': baseBg,
      '--row-tint': tint,
      background: `linear-gradient(var(--row-tint), var(--row-tint)), var(--row-base)`,
    };
    return (
      <div key={lane.id} className="deps-cell" style={cellStyle as CSSProperties}>
        <FeaturesCell html={dependenciesHtmlForSwimlane(dependencyItems, lane.id)} />
      </div>
    );
  };

  return (
    <div className="right-panel" ref={ref} onScroll={handleScroll} style={{ width }}>
      <div className="right-panel-header">Key dependencies</div>
      <div className="right-panel-week-row" />
      {sectionedLanes.map(({ section, lanes }) => (
        <div key={section.id}>
          <div
            className="section-header"
            style={{
              '--section-tint': section.color ? hexToRgba(section.color, SWIMLANE_TINT_ALPHA) : 'transparent',
              '--section-accent': section.color || 'var(--accent-primary)',
            } as CSSProperties}
          >{section.label}</div>
          {lanes.map((lane, i) => renderCell(lane, i))}
          {/* Mirrors the left panel's "+ Add project" row height. */}
          <div className="panel-add-spacer" />
        </div>
      ))}
    </div>
  );
});

RightPanel.displayName = 'RightPanel';
export default RightPanel;
