import { useGanttStore } from '../store/useGanttStore';
import { useThemeColors } from '../theme/ThemeContext';

interface Props {
  weekOffset: number;
  height: number;
  yStart: number;
}

export default function TodayMarker({ weekOffset, height, yStart }: Props) {
  const c = useThemeColors();
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
        fill={c.TODAY_STRIP}
      />
      {/* Center line */}
      <line
        x1={x}
        y1={yStart}
        x2={x}
        y2={yStart + height}
        stroke={c.TODAY_LINE}
        strokeWidth={2.5}
      />
    </g>
  );
}
