import { useMemo, useRef, useState, useCallback } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { ROW_HEIGHT, BAR_HEIGHT, BAR_RADIUS, SECTION_HEADER_HEIGHT } from '../types/gantt';
import { getTodayWeekOffset, getMonthsFromWeeks, getHolidayWeekOffsets, getWeekendDayRanges, getCalendarWeekBoundaries } from '../utils/dateUtils';
import { PHASE_PRESETS } from '../data/phasePresets';
import { useSectionedLanes } from '../hooks/useSectionedLanes';
import TimelineGrid from './TimelineGrid';
import PhaseBar from './PhaseBar';
import TodayMarker from './TodayMarker';
import MilestoneMarker from './MilestoneMarker';
import PhaseTypePicker from './PhaseTypePicker';

interface DrawingBar {
  swimlaneId: string;
  startWeek: number;
  currentWeek: number;
}

export default function TimelineContent() {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const milestones = useGanttStore(s => s.milestones);
  const timeline = useGanttStore(s => s.timeline);
  const selectBar = useGanttStore(s => s.selectBar);
  const dragIndicatorWeek = useGanttStore(s => s.dragIndicatorWeek);
  const quickAddPhaseBar = useGanttStore(s => s.quickAddPhaseBar);
  const isSpaceHeld = useGanttStore(s => s.isSpaceHeld);
  const lastUsedPhaseType = useGanttStore(s => s.lastUsedPhaseType);
  const creatingBarId = useGanttStore(s => s.creatingBarId);
  const showWeekends = useGanttStore(s => s.showWeekends);
  const showHolidays = useGanttStore(s => s.showHolidays);
  const showMilestones = useGanttStore(s => s.showMilestones);

  const sections = useGanttStore(s => s.sections);

  const svgRef = useRef<SVGSVGElement>(null);
  const [drawingBar, setDrawingBar] = useState<DrawingBar | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; time: number; swimlaneId: string; week: number } | null>(null);

  const sectionedLanes = useSectionedLanes(sections, swimlanes);

  const weekWidth = timeline.weekWidthPx;
  const totalRows = sectionedLanes.reduce((sum, sl) => sum + sl.lanes.length, 0);
  const gridWidth = timeline.totalWeeks * weekWidth;
  const contentHeight = totalRows * ROW_HEIGHT + sectionedLanes.length * SECTION_HEADER_HEIGHT;

  // Build a map: swimlaneId -> y offset
  const swimlaneYMap = useMemo(() => {
    const map = new Map<string, number>();
    let y = 0;
    for (const { lanes } of sectionedLanes) {
      y += SECTION_HEADER_HEIGHT;
      for (const lane of lanes) {
        map.set(lane.id, y);
        y += ROW_HEIGHT;
      }
    }
    return map;
  }, [sectionedLanes]);

  const todayOffset = getTodayWeekOffset(timeline.startMonth, timeline.startYear);

  // Compute month spans for alternating background shading
  const monthSpans = useMemo(() => {
    return getMonthsFromWeeks(timeline.startMonth, timeline.startYear, timeline.totalWeeks)
      .map(m => ({ weekStart: m.weekStart, weekCount: m.weekCount }));
  }, [timeline.startMonth, timeline.startYear, timeline.totalWeeks]);

  // Public holiday offsets
  const holidays = useMemo(() => {
    return getHolidayWeekOffsets(timeline.startMonth, timeline.startYear, timeline.totalWeeks);
  }, [timeline.startMonth, timeline.startYear, timeline.totalWeeks]);

  // Weekend day ranges (fractional-week spans covering Sat + Sun)
  const weekendSpans = useMemo(() => {
    return getWeekendDayRanges(timeline.startMonth, timeline.startYear, timeline.totalWeeks);
  }, [timeline.startMonth, timeline.startYear, timeline.totalWeeks]);

  // Calendar-week (Monday) boundaries — used for aligning grid lines + labels
  const weekBoundaries = useMemo(() => {
    return getCalendarWeekBoundaries(timeline.startMonth, timeline.startYear, timeline.totalWeeks);
  }, [timeline.startMonth, timeline.startYear, timeline.totalWeeks]);

  // Convert clientX/clientY to swimlaneId + week
  const hitTest = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = clientX - rect.left;
    const svgY = clientY - rect.top;
    const week = Math.floor(svgX / weekWidth);

    // Reverse lookup: find which swimlane this Y falls in
    let foundLane: string | null = null;
    for (const [id, y] of swimlaneYMap.entries()) {
      if (svgY >= y && svgY < y + ROW_HEIGHT) {
        foundLane = id;
        break;
      }
    }
    if (!foundLane || week < 0) return null;
    return { swimlaneId: foundLane, week };
  }, [swimlaneYMap, weekWidth]);

  // Double-click: instant bar creation
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      e.stopPropagation();
      quickAddPhaseBar(hit.swimlaneId, hit.week, 4);
    }
  }, [hitTest, quickAddPhaseBar]);

  // Pointer handlers for drag-to-create
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || isSpaceHeld) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now(), swimlaneId: hit.swimlaneId, week: hit.week };
  }, [hitTest, isSpaceHeld]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pd = pointerDownRef.current;
    if (!pd) return;
    const dist = Math.hypot(e.clientX - pd.x, e.clientY - pd.y);
    if (dist < 5 && !drawingBar) return;

    if (!drawingBar) {
      // Enter drag-to-create mode
      (e.target as Element).setPointerCapture(e.pointerId);
      setDrawingBar({ swimlaneId: pd.swimlaneId, startWeek: pd.week, currentWeek: pd.week });
    } else {
      // Update current week
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const week = Math.floor(svgX / weekWidth);
      setDrawingBar(prev => prev ? { ...prev, currentWeek: Math.max(0, week) } : null);
    }
  }, [drawingBar, weekWidth]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (drawingBar) {
      // Finalize drag-to-create
      const minW = Math.min(drawingBar.startWeek, drawingBar.currentWeek);
      const maxW = Math.max(drawingBar.startWeek, drawingBar.currentWeek);
      const duration = maxW - minW + 1;
      quickAddPhaseBar(drawingBar.swimlaneId, minW, duration);
      setDrawingBar(null);
      pointerDownRef.current = null;
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    } else if (pointerDownRef.current) {
      // Simple click — deselect
      selectBar(null);
      pointerDownRef.current = null;
    }
  }, [drawingBar, quickAddPhaseBar, selectBar]);

  const handlePointerCancel = useCallback(() => {
    setDrawingBar(null);
    pointerDownRef.current = null;
  }, []);

  // Clear stale pointerDownRef when pointer leaves SVG without entering draw mode.
  // (setPointerCapture suppresses pointerleave during active capture, so this
  //  only fires for the non-drawing case — exactly the stale-ref scenario.)
  const handlePointerLeave = useCallback(() => {
    if (!drawingBar) {
      pointerDownRef.current = null;
    }
  }, [drawingBar]);

  // Ghost bar rendering data
  const ghostBar = useMemo(() => {
    if (!drawingBar) return null;
    const minW = Math.min(drawingBar.startWeek, drawingBar.currentWeek);
    const maxW = Math.max(drawingBar.startWeek, drawingBar.currentWeek);
    const rowY = swimlaneYMap.get(drawingBar.swimlaneId);
    if (rowY === undefined) return null;
    const colors = PHASE_PRESETS[lastUsedPhaseType];
    return {
      x: minW * weekWidth,
      y: rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2,
      width: (maxW - minW + 1) * weekWidth,
      fill: colors.fill,
      stroke: colors.stroke,
    };
  }, [drawingBar, swimlaneYMap, weekWidth, lastUsedPhaseType]);

  // Find creating bar position for PhaseTypePicker
  const creatingBar = creatingBarId ? phaseBars.find(b => b.id === creatingBarId) : null;
  const creatingBarPos = useMemo(() => {
    if (!creatingBar || !svgRef.current) return null;
    const rowY = swimlaneYMap.get(creatingBar.swimlaneId);
    if (rowY === undefined) return null;
    return {
      barId: creatingBar.id,
      svgRef: svgRef,
      x: creatingBar.startWeek * weekWidth,
      y: rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2 + BAR_HEIGHT,
      width: creatingBar.durationWeeks * weekWidth,
    };
  }, [creatingBar, swimlaneYMap, weekWidth]);

  return (
    <>
    <svg
      ref={svgRef}
      width={gridWidth}
      height={contentHeight}
      style={{ display: 'block', minWidth: gridWidth }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
      {/* Grid background */}
      <TimelineGrid
        totalWeeks={timeline.totalWeeks}
        sections={sectionedLanes.map(sl => ({
          id: sl.section.id,
          label: sl.section.label,
          laneCount: sl.lanes.length,
        }))}
        weekWidth={weekWidth}
        monthSpans={monthSpans}
        holidays={holidays}
        weekendSpans={weekendSpans}
        weekBoundaries={weekBoundaries}
        showWeekends={showWeekends}
        showHolidays={showHolidays}
      />

      {/* Row hover highlights */}
      {sectionedLanes.flatMap(sl => sl.lanes).map(lane => {
        const rowY = swimlaneYMap.get(lane.id);
        if (rowY === undefined) return null;
        return (
          <rect
            key={`hover-${lane.id}`}
            x={0}
            y={rowY}
            width={gridWidth}
            height={ROW_HEIGHT}
            className="row-hover"
            style={{ pointerEvents: 'all' }}
          />
        );
      })}

      {/* Today marker (rendered on top of hover rects so it's always visible) */}
      {todayOffset >= 0 && todayOffset <= timeline.totalWeeks && (
        <TodayMarker weekOffset={todayOffset} height={contentHeight} yStart={0} />
      )}

      {/* Phase bars */}
      {phaseBars.map(bar => {
        const rowY = swimlaneYMap.get(bar.swimlaneId);
        if (rowY === undefined) return null;
        return <PhaseBar key={bar.id} bar={bar} rowY={rowY} />;
      })}

      {/* Empty state hint */}
      {phaseBars.length === 0 && (
        <text
          x={gridWidth / 2} y={contentHeight / 2}
          textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-secondary)" fontSize={13}
          fontFamily="'Figtree', Helvetica, Arial, sans-serif"
          opacity={0.5} style={{ pointerEvents: 'none' }}
        >
          Click and drag to create a phase bar
        </text>
      )}

      {/* Milestones (rendered on top of phase bars so the go-live date is always readable) */}
      {showMilestones && milestones.map(m => {
        const rowY = swimlaneYMap.get(m.swimlaneId);
        if (rowY === undefined) return null;
        return <MilestoneMarker key={m.id} id={m.id} week={m.week} rowY={rowY} />;
      })}

      {/* Ghost bar during drag-to-create */}
      {ghostBar && (
        <rect
          x={ghostBar.x}
          y={ghostBar.y}
          width={ghostBar.width}
          height={BAR_HEIGHT}
          rx={BAR_RADIUS}
          ry={BAR_RADIUS}
          fill={ghostBar.fill}
          stroke={ghostBar.stroke}
          strokeWidth={1.5}
          strokeDasharray="4 2"
          opacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Snap indicator line while dragging */}
      {dragIndicatorWeek !== null && (
        <line
          x1={dragIndicatorWeek * weekWidth}
          y1={0}
          x2={dragIndicatorWeek * weekWidth}
          y2={contentHeight}
          stroke="#ad4e0a"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>

    {/* Phase type picker for just-created bar */}
    {creatingBarPos && svgRef.current && (
      <PhaseTypePicker
        barId={creatingBarPos.barId}
        svgRef={svgRef}
        barX={creatingBarPos.x}
        barY={creatingBarPos.y}
        barWidth={creatingBarPos.width}
      />
    )}
    </>
  );
}
