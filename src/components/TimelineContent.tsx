import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { ROW_HEIGHT, BAR_HEIGHT, BAR_RADIUS, SECTION_HEADER_HEIGHT } from '../types/gantt';
import { getTodayWeekOffset, getMonthsFromWeeks, getHolidayWeekOffsets, getWeekendDayRanges, getCalendarWeekBoundaries } from '../utils/dateUtils';
import { getPhaseDef } from '../data/phasePresets';
import { useSectionedLanes } from '../hooks/useSectionedLanes';
import { getContentions } from '../utils/contention';
import TimelineGrid from './TimelineGrid';
import PhaseBar from './PhaseBar';
import TodayMarker from './TodayMarker';
import MilestoneMarker from './MilestoneMarker';
import PhaseTypePicker from './PhaseTypePicker';
import FloatingNote from './FloatingNote';

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
  const showEnvMarquees = useGanttStore(s => s.showEnvMarquees);
  const showContention = useGanttStore(s => s.showContention);

  const sections = useGanttStore(s => s.sections);
  const environments = useGanttStore(s => s.environments);
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const environmentFocusId = useGanttStore(s => s.environmentFocusId);
  const hoveredBarId = useGanttStore(s => s.hoveredBarId);
  const floatingNotes = useGanttStore(s => s.floatingNotes);

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
    const def = getPhaseDef(lastUsedPhaseType, phaseTypes);
    return {
      x: minW * weekWidth,
      y: rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2,
      width: (maxW - minW + 1) * weekWidth,
      fill: def.fill,
      stroke: def.stroke,
    };
  }, [drawingBar, swimlaneYMap, weekWidth, lastUsedPhaseType, phaseTypes]);

  // === Contention computation ===
  const contentions = useMemo(
    () => getContentions({ environments, swimlanes, phaseBars }),
    [environments, swimlanes, phaseBars]
  );

  const envById = useMemo(() => new Map(environments.map(e => [e.id, e])), [environments]);
  const barById = useMemo(() => new Map(phaseBars.map(b => [b.id, b])), [phaseBars]);

  // Listen for the env panel's "scroll-to-bar" custom event so clicks in the
  // contention list bring the bar into view.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ barId: string }>).detail?.barId;
      if (!id) return;
      const bar = phaseBars.find(b => b.id === id);
      const rowY = bar ? swimlaneYMap.get(bar.swimlaneId) : undefined;
      if (!bar || rowY === undefined) return;
      const wrapper = svgRef.current?.parentElement;
      if (!wrapper) return;
      const targetX = bar.startWeek * weekWidth;
      wrapper.scrollLeft = Math.max(0, targetX - wrapper.clientWidth / 2);
      wrapper.scrollTop = Math.max(0, rowY - wrapper.clientHeight / 2);
    };
    window.addEventListener('gantt:scroll-to-bar', handler);
    return () => window.removeEventListener('gantt:scroll-to-bar', handler);
  }, [phaseBars, swimlaneYMap, weekWidth]);

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
    <div
      className="timeline-content-stack"
      style={{ position: 'relative', width: gridWidth, height: contentHeight }}
    >
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

      {/* Env marquees — one dashed bounding box per run of adjacent
          same-env bars within a swimlane. Rendered before bars so the
          dashed border frames them without sitting on top of fills. */}
      {showEnvMarquees && (() => {
        const groups = new Map<string, { swimlaneId: string; envId: string; bars: typeof phaseBars }>();
        for (const bar of phaseBars) {
          if (!bar.environmentId) continue;
          const key = `${bar.swimlaneId}::${bar.environmentId}`;
          let g = groups.get(key);
          if (!g) {
            g = { swimlaneId: bar.swimlaneId, envId: bar.environmentId, bars: [] };
            groups.set(key, g);
          }
          g.bars.push(bar);
        }

        const segments: React.ReactElement[] = [];
        const adjacencyTolerance = 0.01; // ~1 hour in week units
        for (const [, g] of groups) {
          const env = envById.get(g.envId);
          const rowY = swimlaneYMap.get(g.swimlaneId);
          if (!env || rowY === undefined) continue;

          const sorted = [...g.bars].sort((a, b) => a.startWeek - b.startWeek);
          const runs: Array<{ start: number; end: number }> = [];
          let cur = {
            start: sorted[0].startWeek,
            end: sorted[0].startWeek + sorted[0].durationWeeks,
          };
          for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            const nextEnd = next.startWeek + next.durationWeeks;
            if (next.startWeek <= cur.end + adjacencyTolerance) {
              if (nextEnd > cur.end) cur.end = nextEnd;
            } else {
              runs.push(cur);
              cur = { start: next.startWeek, end: nextEnd };
            }
          }
          runs.push(cur);

          const y = rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2 - 3;
          const h = BAR_HEIGHT + 6;
          runs.forEach((run, idx) => {
            const x = run.start * weekWidth - 3;
            const w = (run.end - run.start) * weekWidth + 6;
            segments.push(
              <rect
                key={`env-marquee-${g.swimlaneId}-${g.envId}-${idx}`}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={BAR_RADIUS + 2}
                ry={BAR_RADIUS + 2}
                fill="none"
                stroke={env.color}
                strokeWidth={1.75}
                strokeDasharray="5 3"
                style={{ pointerEvents: 'none' }}
              />
            );
          });
        }
        return segments;
      })()}

      {/* Phase bars (wrapped with focus-mode opacity when an env is in focus) */}
      {phaseBars.map(bar => {
        const rowY = swimlaneYMap.get(bar.swimlaneId);
        if (rowY === undefined) return null;
        const dim = environmentFocusId !== null && bar.environmentId !== environmentFocusId;
        return (
          <g
            key={bar.id}
            style={dim ? { opacity: 0.3, filter: 'saturate(0.6)' } : undefined}
          >
            <PhaseBar bar={bar} rowY={rowY} />
          </g>
        );
      })}


      {/* Hover highlight — translucent vertical band over the contended
          time range, spanning the rows of both contending bars. Drawn when
          a contending bar is hovered, or for every contention in focus mode. */}
      {showContention && contentions.map((c, i) => {
        if (environmentFocusId === null) {
          if (hoveredBarId !== c.barAId && hoveredBarId !== c.barBId) return null;
        } else if (environmentFocusId !== c.envId) {
          return null;
        }
        const env = envById.get(c.envId);
        if (!env) return null;
        const barA = barById.get(c.barAId);
        const barB = barById.get(c.barBId);
        const rowYA = barA ? swimlaneYMap.get(barA.swimlaneId) : undefined;
        const rowYB = barB ? swimlaneYMap.get(barB.swimlaneId) : undefined;
        if (rowYA === undefined || rowYB === undefined) return null;

        const startDay = Math.floor(c.weekRange[0] * 7);
        const endDay = Math.ceil(c.weekRange[1] * 7);
        const x = (startDay / 7) * weekWidth;
        const w = Math.max(4, ((endDay - startDay) / 7) * weekWidth);
        const yTop = Math.min(rowYA, rowYB);
        const yBot = Math.max(rowYA, rowYB) + ROW_HEIGHT;
        return (
          <rect
            key={`hover-band-${i}`}
            x={x}
            y={yTop}
            width={w}
            height={yBot - yTop}
            fill={env.color}
            opacity={0.22}
            stroke={env.color}
            strokeOpacity={0.8}
            strokeWidth={1}
            strokeDasharray="3 3"
            style={{ pointerEvents: 'none' }}
          />
        );
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

      {/* Contention ribbons. One unified strip per bar, made of the union
          of every contention range that bar is involved in. Rendered after
          milestones so nothing else covers them. */}
      {showContention && (() => {
        const byBar = new Map<string, { envId: string; ranges: Array<[number, number]> }>();
        for (const c of contentions) {
          if (environmentFocusId !== null && environmentFocusId !== c.envId) continue;
          for (const barId of [c.barAId, c.barBId]) {
            let entry = byBar.get(barId);
            if (!entry) { entry = { envId: c.envId, ranges: [] }; byBar.set(barId, entry); }
            entry.ranges.push([c.weekRange[0], c.weekRange[1]]);
          }
        }

        const unionRanges = (ranges: Array<[number, number]>): Array<[number, number]> => {
          if (ranges.length === 0) return [];
          const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
          const out: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
          for (let i = 1; i < sorted.length; i++) {
            const cur = out[out.length - 1];
            const [s, e] = sorted[i];
            if (s <= cur[1]) {
              if (e > cur[1]) cur[1] = e;
            } else {
              out.push([s, e]);
            }
          }
          return out;
        };

        const ribbonH = 5;
        const segments: React.ReactElement[] = [];
        for (const [barId, info] of byBar) {
          const env = envById.get(info.envId);
          if (!env) continue;
          const bar = barById.get(barId);
          const rowY = bar ? swimlaneYMap.get(bar.swimlaneId) : undefined;
          if (!bar || rowY === undefined) continue;
          const yRibbon = rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2 + BAR_HEIGHT + 1;
          const merged = unionRanges(info.ranges);
          merged.forEach(([rs, re], idx) => {
            // Snap the strip out to whole-day boundaries (floor start, ceil
            // end) so it aligns with the day-rounded dates the user reads
            // off the bar. Without this a 4.7-day overlap could render as
            // 4-and-a-bit days, looking shorter than the visible overlap.
            const startDay = Math.floor(rs * 7);
            const endDay = Math.ceil(re * 7);
            const x = (startDay / 7) * weekWidth;
            const trueW = ((endDay - startDay) / 7) * weekWidth;
            const w = Math.max(4, trueW);
            segments.push(
              <g key={`ribbon-${barId}-${idx}`} style={{ pointerEvents: 'none' }}>
                <rect
                  x={x}
                  y={yRibbon}
                  width={w}
                  height={ribbonH}
                  fill={env.color}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={0.75}
                  rx={1.5}
                  ry={1.5}
                />
              </g>
            );
          });
        }
        return segments;
      })()}

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

    {/* Floating notes overlay — absolutely positioned over the SVG content,
        scrolls with the timeline. pointer-events:none on the layer so empty
        regions still let bar drag-create work; the notes themselves opt
        back in via their own styles. */}
    {floatingNotes.length > 0 && (
      <div
        className="floating-notes-layer"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        {floatingNotes.map(n => (
          <FloatingNote key={n.id} note={n} />
        ))}
      </div>
    )}
    </div>

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
