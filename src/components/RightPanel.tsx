import { forwardRef } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { Swimlane } from '../types/gantt';
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

  const renderCell = (lane: Swimlane, index: number) => (
    <div
      key={lane.id}
      className="deps-cell"
      style={{ background: index % 2 === 0 ? '#faf9f6' : '#f5f2ec' }}
    >
      <RichTextEditor
        key={lane.id}
        value={lane.keyDependencies}
        onSave={v => updateSwimlane(lane.id, { keyDependencies: v })}
        className="deps-cell-editor"
      />
    </div>
  );

  return (
    <div className="right-panel" ref={ref} onScroll={handleScroll} style={{ width }}>
      <div className="right-panel-header">Key Dependencies</div>
      <div className="right-panel-week-row" />
      {sectionedLanes.map(({ section, lanes }) => (
        <div key={section.id}>
          <div className="section-header" style={{ fontSize: 10 }}>{section.label}</div>
          {lanes.map((lane, i) => renderCell(lane, i))}
        </div>
      ))}
    </div>
  );
});

RightPanel.displayName = 'RightPanel';
export default RightPanel;
