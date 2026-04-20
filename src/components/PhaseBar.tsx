import { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PhaseBar as PhaseBarType, PhaseType } from '../types/gantt';
import { BAR_HEIGHT, BAR_RADIUS, ROW_HEIGHT } from '../types/gantt';
import { PHASE_PRESETS } from '../data/phasePresets';
import { useGanttStore } from '../store/useGanttStore';
import { getDateAtWeekOffset, formatDayMonth } from '../utils/dateUtils';
import ContextMenu from './ContextMenu';

interface Props {
  bar: PhaseBarType;
  rowY: number;
}

interface DragState {
  startX: number;
  origStartWeek: number;
  origDuration: number;
  mode: 'move' | 'resize-left' | 'resize-right';
}

export default function PhaseBar({ bar, rowY }: Props) {
  const moveBar = useGanttStore(s => s.moveBar);
  const resizeBar = useGanttStore(s => s.resizeBar);
  const selectBar = useGanttStore(s => s.selectBar);
  const removePhaseBar = useGanttStore(s => s.removePhaseBar);
  const updatePhaseBar = useGanttStore(s => s.updatePhaseBar);
  const saveToStorage = useGanttStore(s => s.saveToStorage);
  const beginDrag = useGanttStore(s => s.beginDrag);
  const setDragIndicator = useGanttStore(s => s.setDragIndicator);
  const selectedBarId = useGanttStore(s => s.selectedBarId);
  const weekWidth = useGanttStore(s => s.timeline.weekWidthPx);
  const startMonth = useGanttStore(s => s.timeline.startMonth);
  const startYear = useGanttStore(s => s.timeline.startYear);
  const showBarDates = useGanttStore(s => s.showBarDates);

  const colors = bar.colorOverride || PHASE_PRESETS[bar.phaseType];
  const x = bar.startWeek * weekWidth;
  const width = bar.durationWeeks * weekWidth;
  const y = rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2;
  const displayWidth = Math.max(width, weekWidth);

  const [editing, setEditing] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const isSelected = selectedBarId === bar.id;

  const handlePointerDown = useCallback((e: React.PointerEvent, mode: DragState['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    beginDrag(); // snapshot for undo
    dragRef.current = {
      startX: e.clientX,
      origStartWeek: bar.startWeek,
      origDuration: bar.durationWeeks,
      mode,
    };
    selectBar(bar.id);
  }, [bar.startWeek, bar.durationWeeks, bar.id, selectBar, beginDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();

    // Snap to calendar days: 1 day = weekWidth / 7.
    const dayPx = weekWidth / 7;
    const dayDelta = Math.round((e.clientX - drag.startX) / dayPx);
    const weekDelta = dayDelta / 7;
    const minDuration = 1 / 7;

    if (drag.mode === 'move') {
      const newStart = Math.max(0, drag.origStartWeek + weekDelta);
      moveBar(bar.id, newStart);
      setDragIndicator(newStart);
    } else if (drag.mode === 'resize-left') {
      const newStart = Math.max(0, drag.origStartWeek + weekDelta);
      const newDuration = drag.origDuration - (newStart - drag.origStartWeek);
      if (newDuration >= minDuration) {
        resizeBar(bar.id, newStart, newDuration);
        setDragIndicator(newStart);
      }
    } else if (drag.mode === 'resize-right') {
      const newDuration = Math.max(minDuration, drag.origDuration + weekDelta);
      resizeBar(bar.id, drag.origStartWeek, newDuration);
      setDragIndicator(drag.origStartWeek + newDuration);
    }
  }, [bar.id, moveBar, resizeBar, setDragIndicator, weekWidth]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current = null;
      setDragIndicator(null);
      saveToStorage();
    }
  }, [saveToStorage, setDragIndicator]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const handleChangePhase = useCallback((phaseType: PhaseType) => {
    updatePhaseBar(bar.id, { phaseType, label: PHASE_PRESETS[phaseType].label, colorOverride: undefined });
    setCtxMenu(null);
  }, [bar.id, updatePhaseBar]);

  const handleCtxDelete = useCallback(() => {
    removePhaseBar(bar.id);
    setCtxMenu(null);
  }, [bar.id, removePhaseBar]);

  const handleCtxEditLabel = useCallback(() => {
    setCtxMenu(null);
    setEditing(true);
  }, []);

  // Wider hit areas for resize handles (12px each side)
  const handleWidth = 12;
  const startDate = getDateAtWeekOffset(startMonth, startYear, bar.startWeek);
  // End date is inclusive of the last day, so subtract one day to get the label
  // ("15 Jan – 19 Jan" reads more naturally than "15 Jan – 20 Jan" for a 5-day run).
  const endDate = getDateAtWeekOffset(startMonth, startYear, bar.startWeek + bar.durationWeeks - 1 / 7);
  const durationDays = Math.round(bar.durationWeeks * 7);
  const tooltipText = `${bar.label}\n${colors.label || bar.phaseType}\n${formatDayMonth(startDate)} – ${formatDayMonth(endDate)} (${durationDays} day${durationDays !== 1 ? 's' : ''})\nDouble-click to edit · Right-click for options`;

  return (
    <g>
      {/* Main bar body */}
      <rect
        x={x}
        y={y}
        width={displayWidth}
        height={BAR_HEIGHT}
        rx={BAR_RADIUS}
        ry={BAR_RADIUS}
        fill={colors.fill}
        stroke={isSelected ? '#333' : colors.stroke}
        strokeWidth={isSelected ? 2 : 1}
        style={{ cursor: 'grab', filter: isSelected ? 'drop-shadow(0 0 3px rgba(0,0,0,0.3))' : undefined }}
        onPointerDown={e => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <title>{tooltipText}</title>
      </rect>

      {/* Start-date label (rotated, on the left edge — toggled via toolbar) */}
      {showBarDates && !editing && (
        <text
          x={x + 7}
          y={y + BAR_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={colors.text}
          fontSize={8}
          fontWeight={700}
          fontFamily="'Figtree', Helvetica, Arial, sans-serif"
          transform={`rotate(-90, ${x + 7}, ${y + BAR_HEIGHT / 2})`}
          style={{ pointerEvents: 'none', userSelect: 'none', opacity: 0.85 }}
        >
          {formatDayMonth(startDate)}
        </text>
      )}

      {/* Label */}
      {!editing && (
        <text
          x={x + displayWidth / 2}
          y={y + BAR_HEIGHT / 2 + 3}
          textAnchor="middle"
          fill={colors.text}
          fontSize={10}
          fontWeight={700}
          fontFamily="'Figtree', Helvetica, Arial, sans-serif"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {bar.label}
        </text>
      )}

      {/* Inline edit */}
      {editing && (
        <foreignObject x={x} y={y} width={displayWidth} height={BAR_HEIGHT}>
          <input
            autoFocus
            defaultValue={bar.label}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "'Figtree', Helvetica, Arial, sans-serif",
              color: colors.text,
              outline: 'none',
            }}
            onBlur={e => {
              updatePhaseBar(bar.id, { label: e.target.value });
              setEditing(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        </foreignObject>
      )}

      {/* Left resize handle - wider hit area, on top */}
      <rect
        x={x - 2}
        y={y}
        width={handleWidth}
        height={BAR_HEIGHT}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={e => handlePointerDown(e, 'resize-left')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Right resize handle - wider hit area, on top */}
      <rect
        x={x + displayWidth - handleWidth + 2}
        y={y}
        width={handleWidth}
        height={BAR_HEIGHT}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={e => handlePointerDown(e, 'resize-right')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Context menu (portal to body, outside SVG) */}
      {ctxMenu && createPortal(
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onChangePhase={handleChangePhase}
          onEditLabel={handleCtxEditLabel}
          onDelete={handleCtxDelete}
          onClose={() => setCtxMenu(null)}
        />,
        document.body
      )}
    </g>
  );
}
