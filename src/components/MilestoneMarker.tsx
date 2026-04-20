import { useRef, useCallback } from 'react';
import { ROW_HEIGHT } from '../types/gantt';
import { useGanttStore } from '../store/useGanttStore';
import { getDateAtWeekOffset, formatDayMonth } from '../utils/dateUtils';

interface Props {
  id: string;
  week: number;
  rowY: number;
}

/**
 * Go-live marker. Snaps to calendar days (fractional weeks).
 * Shows the target date as vertical text inside a thin green bar.
 */
export default function MilestoneMarker({ id, week, rowY }: Props) {
  const updateMilestone = useGanttStore(s => s.updateMilestone);
  const removeMilestone = useGanttStore(s => s.removeMilestone);
  const saveToStorage = useGanttStore(s => s.saveToStorage);
  const beginDrag = useGanttStore(s => s.beginDrag);
  const weekWidth = useGanttStore(s => s.timeline.weekWidthPx);
  const startMonth = useGanttStore(s => s.timeline.startMonth);
  const startYear = useGanttStore(s => s.timeline.startYear);

  const dragRef = useRef<{ startX: number; origWeek: number } | null>(null);

  // Enough room for rotated "DD Mon" text at 8px. Keeps a readable minimum
  // even when zoomed way out, and grows with zoom so it stays proportional.
  const markerWidth = Math.max(12, weekWidth * 0.3);
  const dayPx = weekWidth / 7;
  // Center on the MIDDLE of the target day (not its left edge), so the
  // marker visually straddles the day it represents — day-snapping drag
  // still produces integer-day offsets, but the bar sits inside the day
  // column rather than on the boundary between days.
  const cx = week * weekWidth + dayPx / 2;
  const x = cx - markerWidth / 2;
  const cy = rowY + ROW_HEIGHT / 2;

  const date = getDateAtWeekOffset(startMonth, startYear, week);
  const label = formatDayMonth(date);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    beginDrag();
    dragRef.current = { startX: e.clientX, origWeek: week };
  }, [week, beginDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // Snap to calendar days: one day = weekWidth / 7.
    const dayDelta = Math.round((e.clientX - dragRef.current.startX) / dayPx);
    const newWeek = Math.max(0, dragRef.current.origWeek + dayDelta / 7);
    updateMilestone(id, { week: newWeek });
  }, [id, updateMilestone, dayPx]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      saveToStorage();
    }
  }, [saveToStorage]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this milestone?')) {
      removeMilestone(id);
    }
  }, [id, removeMilestone]);

  return (
    <g
      style={{ cursor: 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      <rect
        x={x}
        y={rowY + 2}
        width={markerWidth}
        height={ROW_HEIGHT - 4}
        rx={3}
        ry={3}
        fill="#d5e8d4"
        stroke="#82b366"
        strokeWidth={1.2}
      >
        <title>Go-Live: {label}</title>
      </rect>
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fontWeight={700}
        fontFamily="'Figtree', Helvetica, Arial, sans-serif"
        fill="#2d4c1c"
        transform={`rotate(-90, ${cx}, ${cy})`}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}
