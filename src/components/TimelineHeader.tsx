import { useEffect, useRef } from 'react';
import { HEADER_HEIGHT, WEEK_LABEL_HEIGHT } from '../types/gantt';
import { useGanttStore } from '../store/useGanttStore';
import {
  getMonthsFromWeeks,
  getTodayWeekOffset,
  getDaysInMonth,
  getCalendarWeekBoundaries,
} from '../utils/dateUtils';

interface Props {
  totalWeeks: number;
  startMonth: number;
  startYear: number;
  scrollLeft: number;
}

export default function TimelineHeader({ totalWeeks, startMonth, startYear, scrollLeft }: Props) {
  const weekWidth = useGanttStore(s => s.timeline.weekWidthPx);
  const showMonthDates = useGanttStore(s => s.showMonthDates);
  const gridWidth = totalWeeks * weekWidth;
  const months = getMonthsFromWeeks(startMonth, startYear, totalWeeks);
  const totalHeaderHeight = HEADER_HEIGHT + WEEK_LABEL_HEIGHT;
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Use native scrollLeft on the wrapper to mirror the timeline body's shift
  // mechanism. Previously the SVG itself was offset via `transform: translateX`
  // (and later `marginLeft`), but html2canvas v1.4.1 rasterises SVGs through a
  // path that ignores those CSS-level shifts, so the exported header rendered
  // at week 0 while the body honoured its real scroll position. Native scroll
  // on a div wrapper is handled correctly by html2canvas.
  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.scrollLeft = scrollLeft;
    }
  }, [scrollLeft]);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: totalHeaderHeight,
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <svg
        width={gridWidth}
        height={totalHeaderHeight}
        style={{
          display: 'block',
        }}
      >
        {/* Header background */}
        <rect x={0} y={0} width={gridWidth} height={HEADER_HEIGHT} fill="#1e1b16" />
        <rect x={0} y={HEADER_HEIGHT} width={gridWidth} height={WEEK_LABEL_HEIGHT} fill="#1e1b16" />

        {/* Month names and dividers */}
        {months.map((month, mi) => {
          const x = month.weekStart * weekWidth;
          const w = month.weekCount * weekWidth;
          return (
            <g key={`mh-${mi}`}>
              <text
                x={x + w / 2}
                y={HEADER_HEIGHT / 2 + 4}
                textAnchor="middle"
                fill="#ede9e1"
                fontSize={11}
                fontWeight={700}
                fontFamily="'Figtree', Helvetica, Arial, sans-serif"
              >
                {month.name}
              </text>
              {mi > 0 && (
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={HEADER_HEIGHT}
                  stroke="#3d3930"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {/* Today marker through header */}
        {(() => {
          const todayOffset = getTodayWeekOffset(startMonth, startYear);
          if (todayOffset < 0 || todayOffset > totalWeeks) return null;
          const tx = todayOffset * weekWidth;
          const now = new Date();
          const dateLabel = `${now.getDate()} ${now.toLocaleString('en', { month: 'short' })}`;
          return (
            <g>
              <rect
                x={tx - 9}
                y={0}
                width={18}
                height={totalHeaderHeight}
                fill="rgba(253, 232, 213, 0.25)"
              />
              <line
                x1={tx}
                y1={0}
                x2={tx}
                y2={totalHeaderHeight}
                stroke="#ad4e0a"
                strokeWidth={2.5}
              />
              <rect
                x={tx - 22}
                y={2}
                width={44}
                height={16}
                rx={3}
                fill="#ad4e0a"
              />
              <text
                x={tx}
                y={13}
                textAnchor="middle"
                fill="white"
                fontSize={8}
                fontWeight={700}
                fontFamily="'Figtree', Helvetica, Arial, sans-serif"
              >
                {dateLabel}
              </text>
            </g>
          );
        })()}

        {/* Week or month-date labels in the week label row */}
        {showMonthDates
          ? months.flatMap(month => {
              const days = getDaysInMonth(month.month, month.year);
              const mid = Math.ceil(days / 2);
              const end = days;
              const marks = [1, mid, end];
              return marks.map((d, i) => (
                <text
                  key={`md-${month.year}-${month.month}-${i}`}
                  x={(month.weekStart + (d - 1) / 7) * weekWidth}
                  y={HEADER_HEIGHT + WEEK_LABEL_HEIGHT / 2 + 3}
                  textAnchor="middle"
                  fill="#b6afa4"
                  fontSize={7}
                  fontFamily="Courier New, monospace"
                >
                  {d}
                </text>
              ));
            })
          : (() => {
              // Center each W-label inside its Monday-to-Sunday calendar week.
              // Partial leading/trailing weeks stay unlabeled — they're < 7 days
              // wide so the label would crowd the adjacent week anyway.
              //
              // Consecutive boundaries are Mondays exactly 7 days apart, so by
              // construction every non-last span is a full week. The only
              // span that can be partial is the trailing one (where there is
              // no next boundary). Deriving fullness from the structure
              // avoids IEEE-754 false-negatives — e.g. 32/7 − 25/7 evaluates
              // to 0.9999999999999996, which naive `< 1` drops as "partial".
              const boundaries = getCalendarWeekBoundaries(startMonth, startYear, totalWeeks);
              return boundaries.map((b, i) => {
                const next = boundaries[i + 1];
                let centerX: number;
                if (next) {
                  centerX = (b.weekStart + next.weekStart) / 2 * weekWidth;
                } else {
                  // Trailing boundary — skip if there's < 1 full week of
                  // timeline after this Monday.
                  if (b.weekStart + 1 > totalWeeks + 1e-9) return null;
                  centerX = (b.weekStart + totalWeeks) / 2 * weekWidth;
                }
                return (
                  <text
                    key={`wl-${i}-${b.weekNumber}`}
                    x={centerX}
                    y={HEADER_HEIGHT + WEEK_LABEL_HEIGHT / 2 + 3}
                    textAnchor="middle"
                    fill="#888078"
                    fontSize={7}
                    fontFamily="Courier New, monospace"
                  >
                    W{b.weekNumber}
                  </text>
                );
              });
            })()}
      </svg>
    </div>
  );
}
