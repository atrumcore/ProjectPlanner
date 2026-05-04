import { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PhaseBar as PhaseBarType, PhaseType } from '../types/gantt';
import { BAR_HEIGHT, BAR_RADIUS, ROW_HEIGHT } from '../types/gantt';
import { getPhaseDef } from '../data/phasePresets';
import { useGanttStore } from '../store/useGanttStore';
import { getDateAtWeekOffset, formatDayMonth } from '../utils/dateUtils';
import { getContentionsForBar } from '../utils/contention';
import ContextMenu from './ContextMenu';
import BarEnvPickerPopover from './BarEnvPickerPopover';

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
  const setHoveredBar = useGanttStore(s => s.setHoveredBar);
  const hoveredBarId = useGanttStore(s => s.hoveredBarId);
  const selectedBarId = useGanttStore(s => s.selectedBarId);
  const weekWidth = useGanttStore(s => s.timeline.weekWidthPx);
  const startMonth = useGanttStore(s => s.timeline.startMonth);
  const startYear = useGanttStore(s => s.timeline.startYear);
  const showBarDates = useGanttStore(s => s.showBarDates);
  const showEnvIndicators = useGanttStore(s => s.showEnvIndicators);
  const showContention = useGanttStore(s => s.showContention);
  const environments = useGanttStore(s => s.environments);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const phaseTypes = useGanttStore(s => s.phaseTypes);

  const phaseDef = getPhaseDef(bar.phaseType, phaseTypes);
  const colors = bar.colorOverride ?? {
    fill: phaseDef.fill,
    stroke: phaseDef.stroke,
    text: phaseDef.text,
    label: phaseDef.label,
  };
  const env = bar.environmentId
    ? environments.find(e => e.id === bar.environmentId) ?? null
    : null;
  const x = bar.startWeek * weekWidth;
  const width = bar.durationWeeks * weekWidth;
  const y = rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2;
  // Bar renders at its true width — no minimum-1-week visual clamp.
  const displayWidth = width;

  const [editing, setEditing] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [envPicker, setEnvPicker] = useState<{ x: number; y: number } | null>(null);
  const [dragPill, setDragPill] = useState<{ envNames: string[]; conflict: boolean } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const isSelected = selectedBarId === bar.id;
  const isHovered = hoveredBarId === bar.id;

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

    let proposed: { startWeek: number; durationWeeks: number } | null = null;

    if (drag.mode === 'move') {
      const newStart = Math.max(0, drag.origStartWeek + weekDelta);
      moveBar(bar.id, newStart);
      setDragIndicator(newStart);
      proposed = { startWeek: newStart, durationWeeks: drag.origDuration };
    } else if (drag.mode === 'resize-left') {
      const newStart = Math.max(0, drag.origStartWeek + weekDelta);
      const newDuration = drag.origDuration - (newStart - drag.origStartWeek);
      if (newDuration >= minDuration) {
        resizeBar(bar.id, newStart, newDuration);
        setDragIndicator(newStart);
        proposed = { startWeek: newStart, durationWeeks: newDuration };
      }
    } else if (drag.mode === 'resize-right') {
      const newDuration = Math.max(minDuration, drag.origDuration + weekDelta);
      resizeBar(bar.id, drag.origStartWeek, newDuration);
      setDragIndicator(drag.origStartWeek + newDuration);
      proposed = { startWeek: drag.origStartWeek, durationWeeks: newDuration };
    }

    // Live contention check — only meaningful if this bar is in an
    // Exclusive env. Otherwise drag stays silent.
    if (proposed) {
      const env = bar.environmentId
        ? environments.find(e => e.id === bar.environmentId)
        : null;
      if (showContention && env && env.exclusive) {
        const proposedBar = { ...bar, startWeek: proposed.startWeek, durationWeeks: proposed.durationWeeks };
        const cs = getContentionsForBar(proposedBar, { environments, swimlanes, phaseBars });
        if (cs.length > 0) {
          const envNames = environments.filter(e => cs.some(c => c.envId === e.id)).map(e => e.name);
          setDragPill({ envNames, conflict: true });
        } else {
          setDragPill({ envNames: [], conflict: false });
        }
      } else {
        setDragPill(null);
      }
    }
  }, [bar, moveBar, resizeBar, setDragIndicator, weekWidth, swimlanes, environments, phaseBars, showContention]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current = null;
      setDragIndicator(null);
      saveToStorage();
    }
    // Briefly leave the pill visible so a release on a clear spot is satisfying.
    if (dragPill) {
      const t = setTimeout(() => setDragPill(null), 220);
      return () => clearTimeout(t);
    }
  }, [saveToStorage, setDragIndicator, dragPill]);

  // Hover wiring — drives bezier in TimelineContent
  const handlePointerEnter = useCallback(() => setHoveredBar(bar.id), [bar.id, setHoveredBar]);
  const handlePointerLeaveBar = useCallback(() => setHoveredBar(null), [setHoveredBar]);

  // Clear hover on unmount as a defensive cleanup.
  useEffect(() => () => { setHoveredBar(null); }, [setHoveredBar]);

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
    const def = getPhaseDef(phaseType, phaseTypes);
    updatePhaseBar(bar.id, { phaseType, label: def.label, colorOverride: undefined });
    setCtxMenu(null);
  }, [bar.id, updatePhaseBar, phaseTypes]);

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
  const tooltipText = `${bar.label}\n${colors.label || bar.phaseType}${env ? `\nEnvironment: ${env.name}` : ''}\n${formatDayMonth(startDate)} – ${formatDayMonth(endDate)} (${durationDays} day${durationDays !== 1 ? 's' : ''})\nDouble-click to edit · Right-click for options`;

  return (
    <g onDoubleClick={(e) => e.stopPropagation()}>

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
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeaveBar}
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

      {/* Floating env-name pill above the bar — name reveal on hover/select. */}
      {!editing && !dragPill && showEnvIndicators && (() => {
        const isDragging = dragRef.current !== null;
        if (isDragging) return null;

        const stopMouseDown = (e: React.MouseEvent) => e.stopPropagation();
        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          setEnvPicker({ x: e.clientX, y: e.clientY });
        };

        if (env && (isHovered || isSelected)) {
          const text = env.name;
          const pillW = Math.max(28, Math.ceil(text.length * 5.5) + 12);
          const pillH = 14;
          const px = x + 4;
          const py = y - pillH - 2;
          return (
            <g
              style={{ cursor: 'pointer' }}
              onMouseDown={stopMouseDown}
              onClick={handleClick}
            >
              <rect
                x={px}
                y={py}
                width={pillW}
                height={pillH}
                rx={3}
                ry={3}
                fill={env.color}
                stroke="rgba(0,0,0,0.18)"
                strokeWidth={0.5}
              />
              <text
                x={px + pillW / 2}
                y={py + pillH / 2 + 3}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={9}
                fontWeight={700}
                fontFamily="'Figtree', Helvetica, Arial, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none', letterSpacing: 0.4 }}
              >
                {text}
              </text>
            </g>
          );
        }

        if (!env && isSelected && displayWidth >= 32) {
          const pillW = 56;
          const pillH = 14;
          const px = x + 4;
          const py = y - pillH - 2;
          return (
            <g
              style={{ cursor: 'pointer' }}
              onMouseDown={stopMouseDown}
              onClick={handleClick}
            >
              <rect
                x={px}
                y={py}
                width={pillW}
                height={pillH}
                rx={3}
                ry={3}
                fill="transparent"
                stroke="#7a7264"
                strokeDasharray="2 2"
                strokeWidth={1}
              />
              <text
                x={px + pillW / 2}
                y={py + pillH / 2 + 3}
                textAnchor="middle"
                fill="#7a7264"
                fontSize={9}
                fontWeight={600}
                fontFamily="'Figtree', Helvetica, Arial, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none', letterSpacing: 0.4 }}
              >
                + env
              </text>
            </g>
          );
        }
        return null;
      })()}

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

      {/* Env dot in the upper-right corner — rendered AFTER the resize
          handles so clicks land on it first. Always-on when bar has env;
          dashed "+ env" placeholder for selected unset bars. */}
      {!editing && showEnvIndicators && displayWidth >= 16 && (() => {
        const handleDotClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          setEnvPicker({ x: e.clientX, y: e.clientY });
        };
        const stopPointer = (e: React.PointerEvent) => {
          e.stopPropagation();
        };
        const dotR = 5;
        const cx = x + displayWidth - dotR - 4;
        const cy = y + dotR + 3;
        if (env) {
          return (
            <g
              style={{ cursor: 'pointer' }}
              onPointerDown={stopPointer}
              onClick={handleDotClick}
            >
              <circle
                cx={cx}
                cy={cy}
                r={dotR}
                fill={env.color}
                stroke="#fffaf3"
                strokeWidth={1.5}
                style={{ pointerEvents: 'all' }}
              />
            </g>
          );
        }
        // Unset bar: show "+ env" affordance on hover OR selection so the
        // user doesn't need to click first to discover it.
        if (isHovered || isSelected) {
          return (
            <g
              style={{ cursor: 'pointer' }}
              onPointerDown={stopPointer}
              onClick={handleDotClick}
            >
              {/* Solid hit-area circle (low opacity white) so hit-testing
                  doesn't depend on the dashed stroke's painted pixels. */}
              <circle
                cx={cx}
                cy={cy}
                r={dotR + 1}
                fill="#ffffff"
                fillOpacity={0.001}
                style={{ pointerEvents: 'all' }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={dotR}
                fill="none"
                stroke={isSelected ? '#3d3930' : '#7a7264'}
                strokeDasharray="1.5 1.5"
                strokeWidth={1.25}
                style={{ pointerEvents: 'none' }}
              />
              {/* Tiny "+" inside the dashed circle so users see it as an
                  add affordance, not just a placeholder. */}
              <line
                x1={cx - 2}
                y1={cy}
                x2={cx + 2}
                y2={cy}
                stroke={isSelected ? '#3d3930' : '#7a7264'}
                strokeWidth={1.25}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={cx}
                y1={cy - 2}
                x2={cx}
                y2={cy + 2}
                stroke={isSelected ? '#3d3930' : '#7a7264'}
                strokeWidth={1.25}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        }
        return null;
      })()}

      {/* Drag-time CLEAR/CONFLICT pill (anchored at bar leading edge) */}
      {dragPill && (
        <foreignObject x={x} y={Math.max(0, y - 22)} width={Math.max(120, displayWidth)} height={20} style={{ pointerEvents: 'none', overflow: 'visible' }}>
          <div className={`phase-bar-drag-pill${dragPill.conflict ? ' conflict' : ' clear'}`}>
            {dragPill.conflict ? `CONFLICT (${dragPill.envNames.join(', ')})` : 'CLEAR'}
          </div>
        </foreignObject>
      )}

      {/* Env picker popover (anchored to chip click coordinates) */}
      {envPicker && (
        <BarEnvPickerPopover
          barId={bar.id}
          currentEnvId={bar.environmentId ?? null}
          x={envPicker.x}
          y={envPicker.y}
          onClose={() => setEnvPicker(null)}
        />
      )}

      {/* Context menu (portal to body, outside SVG) */}
      {ctxMenu && createPortal(
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          barId={bar.id}
          currentEnvId={bar.environmentId ?? null}
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
