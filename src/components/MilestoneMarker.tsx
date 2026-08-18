import { useRef, useCallback, useState, useEffect } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { useExportLayout } from './ExportLayoutContext';
import { getDateAtWeekOffset, formatDayMonth } from '../utils/dateUtils';
import { useThemeColors } from '../theme/ThemeContext';
import { FS, FONT_DISPLAY } from '../theme/typography';

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
  const c = useThemeColors();
  const updateMilestone = useGanttStore(s => s.updateMilestone);
  const removeMilestone = useGanttStore(s => s.removeMilestone);
  const saveToStorage = useGanttStore(s => s.saveToStorage);
  const beginDrag = useGanttStore(s => s.beginDrag);
  const weekWidth = useGanttStore(s => s.timeline.weekWidthPx);
  const startMonth = useGanttStore(s => s.timeline.startMonth);
  const startYear = useGanttStore(s => s.timeline.startYear);
  // Taller rows during export — keep the marker centred and full-height.
  const { rowHeight: ROW_HEIGHT } = useExportLayout();

  const dragRef = useRef<{ startX: number; origWeek: number } | null>(null);

  // Two-click delete confirm (matches the app-wide pattern — no native
  // confirm dialogs). First right-click arms; a second within 3s deletes.
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  // Enough room for rotated "DD Mon" text at 10px. Keeps a readable minimum
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
    if (confirmDelete) {
      removeMilestone(id);
    } else {
      setConfirmDelete(true);
    }
  }, [id, removeMilestone, confirmDelete]);

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
        fill={confirmDelete ? '#c0445a' : c.MILESTONE_FILL}
        stroke={confirmDelete ? '#99001b' : c.MILESTONE_STROKE}
        strokeWidth={1.2}
      >
        <title>{confirmDelete
          ? 'Right-click again to delete this go-live marker'
          : `Go-live: ${label} · Right-click to delete`}</title>
      </rect>
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={FS.label}
        fontWeight={700}
        fontFamily={FONT_DISPLAY}
        fill={c.MILESTONE_TEXT}
        transform={`rotate(-90, ${cx}, ${cy})`}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}
