import type React from 'react';
import { ROW_HEIGHT, SECTION_HEADER_HEIGHT } from '../types/gantt';

interface MonthSpan {
  weekStart: number;
  weekCount: number;
}

interface WeekendSpan {
  weekStart: number;
  weekEnd: number;
}

interface SectionInfo {
  id: string;
  label: string;
  laneCount: number;
}

interface HolidayMark {
  week: number;
  name: string;
}

interface WeekBoundary {
  weekStart: number;
  weekNumber: number;
}

interface Props {
  totalWeeks: number;
  sections: SectionInfo[];
  weekWidth: number;
  monthSpans: MonthSpan[];
  holidays: HolidayMark[];
  weekendSpans: WeekendSpan[];
  weekBoundaries: WeekBoundary[];
  showWeekends: boolean;
  showHolidays: boolean;
}

export default function TimelineGrid({
  totalWeeks,
  sections,
  weekWidth,
  monthSpans,
  holidays,
  weekendSpans,
  weekBoundaries,
  showWeekends,
  showHolidays,
}: Props) {
  const gridWidth = totalWeeks * weekWidth;

  // Compute layout: each section has a header band + rows
  const sectionLayout: { headerY: number; rowsY: number; rowsHeight: number; laneCount: number; label: string }[] = [];
  let yOffset = 0;
  for (const sec of sections) {
    const headerY = yOffset;
    yOffset += SECTION_HEADER_HEIGHT;
    const rowsY = yOffset;
    const rowsHeight = sec.laneCount * ROW_HEIGHT;
    sectionLayout.push({ headerY, rowsY, rowsHeight, laneCount: sec.laneCount, label: sec.label });
    yOffset += rowsHeight;
  }
  // Row-only Y ranges (for clipping grid lines to avoid section headers)
  const rowRanges = sectionLayout
    .filter(s => s.rowsHeight > 0)
    .map(s => ({ top: s.rowsY, bottom: s.rowsY + s.rowsHeight }));

  // Row backgrounds
  const rows: React.ReactElement[] = [];
  for (const sec of sectionLayout) {
    for (let i = 0; i < sec.laneCount; i++) {
      rows.push(
        <rect key={`r-${sec.headerY}-${i}`} x={0} y={sec.rowsY + i * ROW_HEIGHT} width={gridWidth} height={ROW_HEIGHT}
          fill={i % 2 === 0 ? '#faf9f6' : '#f5f2ec'} />
      );
    }
  }

  // Alternating month shading — odd months get a subtle tint (only in row areas)
  const monthShading: React.ReactElement[] = [];
  for (let i = 0; i < monthSpans.length; i++) {
    if (i % 2 === 1) {
      const x = monthSpans[i].weekStart * weekWidth;
      const w = monthSpans[i].weekCount * weekWidth;
      for (const range of rowRanges) {
        monthShading.push(
          <rect key={`ms-${i}-${range.top}`} x={x} y={range.top} width={w} height={range.bottom - range.top}
            fill="rgba(0, 0, 0, 0.045)" />
        );
      }
    }
  }

  // Weekend shading — subtle green tint, same treatment as alternating months
  const weekendShading: React.ReactElement[] = [];
  if (showWeekends) {
    for (let i = 0; i < weekendSpans.length; i++) {
      const x = weekendSpans[i].weekStart * weekWidth;
      const w = (weekendSpans[i].weekEnd - weekendSpans[i].weekStart) * weekWidth;
      for (const range of rowRanges) {
        weekendShading.push(
          <rect key={`ws-${i}-${range.top}`} x={x} y={range.top} width={w} height={range.bottom - range.top}
            fill="rgba(46, 125, 50, 0.1)" />
        );
      }
    }
  }

  // Public holiday grid lines — thin dashed red vertical lines in row areas
  const holidayMarks: React.ReactElement[] = [];
  if (showHolidays) {
    for (const h of holidays) {
      const x = h.week * weekWidth;
      for (const range of rowRanges) {
        holidayMarks.push(
          <g key={`hol-${h.week}-${range.top}`}>
            <line x1={x} y1={range.top} x2={x} y2={range.bottom}
              stroke="transparent" strokeWidth={8} style={{ cursor: 'default' }}>
              <title>{h.name}</title>
            </line>
            <line x1={x} y1={range.top} x2={x} y2={range.bottom}
              stroke="#c44" strokeWidth={1} strokeDasharray="3 3" opacity={0.4}
              style={{ pointerEvents: 'none' }} />
          </g>
        );
      }
    }
  }

  // Weekly grid lines — at calendar-week (Monday) boundaries, plus timeline
  // edges. A Set keeps us from double-drawing when the first Monday happens
  // to be at offset 0 (i.e. the timeline itself starts on a Monday).
  const gridLines: React.ReactElement[] = [];
  const gridPositions = new Set<number>([0, totalWeeks]);
  for (const b of weekBoundaries) {
    if (b.weekStart > 0 && b.weekStart < totalWeeks) gridPositions.add(b.weekStart);
  }
  const sortedPositions = Array.from(gridPositions).sort((a, b) => a - b);
  for (let i = 0; i < sortedPositions.length; i++) {
    const x = sortedPositions[i] * weekWidth;
    for (const range of rowRanges) {
      gridLines.push(
        <line key={`gl-${i}-${range.top}`} x1={x} y1={range.top} x2={x} y2={range.bottom}
          stroke="#dedad3" strokeWidth={1} />
      );
    }
  }

  // Horizontal row lines — only within each section's row area
  const hLines: React.ReactElement[] = [];
  for (const sec of sectionLayout) {
    for (let i = 0; i <= sec.laneCount; i++) {
      const hy = sec.rowsY + i * ROW_HEIGHT;
      hLines.push(
        <line key={`hl-${sec.headerY}-${i}`} x1={0} y1={hy} x2={gridWidth} y2={hy}
          stroke="#dedad3" strokeWidth={1} />
      );
    }
  }

  // Section header bands — rendered last (on top) for clean look
  const sectionHeaders: React.ReactElement[] = [];
  for (const sec of sectionLayout) {
    sectionHeaders.push(
      <g key={`sh-${sec.headerY}`}>
        <rect x={0} y={sec.headerY} width={gridWidth} height={SECTION_HEADER_HEIGHT}
          fill="#e2ded6" />
        <line x1={0} y1={sec.headerY} x2={gridWidth} y2={sec.headerY}
          stroke="#c8c3ba" strokeWidth={1} />
        <line x1={0} y1={sec.headerY + SECTION_HEADER_HEIGHT} x2={gridWidth} y2={sec.headerY + SECTION_HEADER_HEIGHT}
          stroke="#c8c3ba" strokeWidth={1} />
      </g>
    );
  }

  return (
    <>
      {rows}
      {monthShading}
      {weekendShading}
      {holidayMarks}
      {gridLines}
      {hLines}
      {sectionHeaders}
    </>
  );
}
