import { useGanttStore } from '../store/useGanttStore';

interface Props {
  weekOffset: number;
  height: number;
  yStart: number;
}

export default function TodayMarker({ weekOffset, height, yStart }: Props) {
  const weekWidth = useGanttStore(s => s.timeline.weekWidthPx);
  const x = weekOffset * weekWidth;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Faded background strip */}
      <rect
        x={x - 9}
        y={yStart}
        width={18}
        height={height}
        fill="rgba(253, 232, 213, 0.4)"
      />
      {/* Center line */}
      <line
        x1={x}
        y1={yStart}
        x2={x}
        y2={yStart + height}
        stroke="#ad4e0a"
        strokeWidth={2.5}
      />
    </g>
  );
}
