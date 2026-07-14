import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { Swimlane } from '../types/gantt';
import { SWIMLANE_TINT_ALPHA } from '../types/gantt';
import { hexToRgba } from '../theme/colors';
import { useSectionedLanes } from '../hooks/useSectionedLanes';
import RichTextEditor from './RichTextEditor';

interface Props {
  onScroll: (scrollTop: number) => void;
  width: number;
}

const RightPanel = forwardRef<HTMLDivElement, Props>(({ onScroll, width }, ref) => {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const updateSwimlane = useGanttStore(s => s.updateSwimlane);

  const sectionedLanes = useSectionedLanes(sections, swimlanes);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll((e.target as HTMLDivElement).scrollTop);
  };

  const renderCell = (lane: Swimlane, index: number) => {
    // Match the left panel: a tinted row uses a flat base (no even/odd striping)
    // so adjacent coloured rows don't darken; untinted rows keep the stripe.
    const baseBg = lane.color
      ? 'var(--bg-row-even)'
      : index % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)';
    const tint = lane.color ? hexToRgba(lane.color, SWIMLANE_TINT_ALPHA) : 'transparent';
    return (
    <div
      key={lane.id}
      className="deps-cell"
      style={{ background: `linear-gradient(${tint}, ${tint}), ${baseBg}` }}
    >
      <RichTextEditor
        key={lane.id}
        value={lane.keyDependencies}
        onSave={v => updateSwimlane(lane.id, { keyDependencies: v })}
        className="deps-cell-editor"
      />
    </div>
    );
  };

  return (
    <div className="right-panel" ref={ref} onScroll={handleScroll} style={{ width }}>
      <div className="right-panel-header">Key Dependencies</div>
      <div className="right-panel-week-row" />
      {sectionedLanes.map(({ section, lanes }) => (
        <div key={section.id}>
          <div
            className="section-header"
            style={{
              fontSize: 10,
              '--section-tint': section.color ? hexToRgba(section.color, SWIMLANE_TINT_ALPHA) : 'transparent',
              '--section-accent': section.color || 'var(--accent-primary)',
            } as CSSProperties}
          >{section.label}</div>
          {lanes.map((lane, i) => renderCell(lane, i))}
        </div>
      ))}
    </div>
  );
});

RightPanel.displayName = 'RightPanel';
export default RightPanel;
