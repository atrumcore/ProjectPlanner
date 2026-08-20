import { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PhaseBar as PhaseBarType, PhaseType } from '../types/gantt';
import { BAR_HEIGHT, BAR_RADIUS } from '../types/gantt';
import { getPhaseDef } from '../data/phasePresets';
import { useExportLayout } from './ExportLayoutContext';
import { useGanttStore } from '../store/useGanttStore';
import { getDateAtWeekOffset, formatDayMonth } from '../utils/dateUtils';
import { fitText, measureText } from '../utils/textMeasure';
import { getContentionsForBar, getPeopleContentionsForBar } from '../utils/contention';
import { useTheme } from '../theme/ThemeContext';
import ContextMenu from './ContextMenu';
import BarEnvPickerPopover from './BarEnvPickerPopover';
import PeoplePickerPopover from './PeoplePickerPopover';
import { FS, FW, FONT_DISPLAY } from '../theme/typography';

/** "Alice Smith" -> "AS"; single word takes its first two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const { colors: c } = useTheme();
  const barStyle = useGanttStore(s => s.barStyle);
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
  const showPeopleIndicators = useGanttStore(s => s.showPeopleIndicators);
  const showPeopleContention = useGanttStore(s => s.showPeopleContention);
  const environments = useGanttStore(s => s.environments);
  const people = useGanttStore(s => s.people);
  const teams = useGanttStore(s => s.teams);
  const setBarPeople = useGanttStore(s => s.setBarPeople);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  // Taller rows during export — keep the bar vertically centred in its row.
  const { rowHeight: ROW_HEIGHT } = useExportLayout();

  const phaseDef = getPhaseDef(bar.phaseType, phaseTypes);
  // Colours always come from the phase type's own definition, so both bar
  // styles show whatever the user configured in Manage Phase Types. `barStyle`
  // only decides the SHAPE (solid pill vs tagged card), never the colour.
  // A per-bar `colorOverride` still wins.
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
  const [peoplePicker, setPeoplePicker] = useState<{ x: number; y: number } | null>(null);
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

    /**
     * Re-anchor the drag origin whenever a limit is hit.
     *
     * Every branch below clamps its result, but the clamp used to be the end
     * of it: drag a bar left past week 0 and it stopped while the pointer kept
     * going, so the overshoot was silently banked. Coming back, the bar stayed
     * put until the pointer had returned all the way past the boundary — the
     * grab point had drifted from the cursor by however far you overshot, and
     * the bar looked stuck, then jumped. Moving the origin to the cursor at the
     * moment of clamping means the bar re-attaches immediately on the way back.
     */
    const reanchor = (startWeek: number, duration: number) => {
      drag.startX = e.clientX;
      drag.origStartWeek = startWeek;
      drag.origDuration = duration;
    };

    if (drag.mode === 'move') {
      const wanted = drag.origStartWeek + weekDelta;
      const newStart = Math.max(0, wanted);
      if (wanted < 0) reanchor(newStart, drag.origDuration);
      moveBar(bar.id, newStart);
      setDragIndicator(newStart);
      proposed = { startWeek: newStart, durationWeeks: drag.origDuration };
    } else if (drag.mode === 'resize-left') {
      // The left edge cannot cross week 0, nor pass the right edge and leave
      // less than a day of bar behind it.
      const maxStart = drag.origStartWeek + drag.origDuration - minDuration;
      const wanted = drag.origStartWeek + weekDelta;
      const newStart = Math.min(maxStart, Math.max(0, wanted));
      const newDuration = drag.origDuration - (newStart - drag.origStartWeek);
      if (wanted !== newStart) reanchor(newStart, newDuration);
      resizeBar(bar.id, newStart, newDuration);
      setDragIndicator(newStart);
      proposed = { startWeek: newStart, durationWeeks: newDuration };
    } else if (drag.mode === 'resize-right') {
      const wanted = drag.origDuration + weekDelta;
      const newDuration = Math.max(minDuration, wanted);
      if (wanted < minDuration) reanchor(drag.origStartWeek, newDuration);
      resizeBar(bar.id, drag.origStartWeek, newDuration);
      setDragIndicator(drag.origStartWeek + newDuration);
      proposed = { startWeek: drag.origStartWeek, durationWeeks: newDuration };
    }

    // Live contention check — env conflicts when the bar is in an Exclusive
    // env, plus people double-bookings when it has assignees/teams. A bar
    // with neither drags silently.
    if (proposed) {
      const proposedBar = { ...bar, startWeek: proposed.startWeek, durationWeeks: proposed.durationWeeks };
      const env = bar.environmentId
        ? environments.find(e => e.id === bar.environmentId)
        : null;
      const checkEnv = showContention && !!env && env.exclusive;
      const checkPeople = showPeopleContention && (bar.assigneeIds.length > 0 || bar.teamIds.length > 0);
      if (checkEnv || checkPeople) {
        const names: string[] = [];
        if (checkEnv) {
          const cs = getContentionsForBar(proposedBar, { environments, swimlanes, phaseBars });
          names.push(...environments.filter(e => cs.some(c => c.envId === e.id)).map(e => e.name));
        }
        if (checkPeople) {
          const pcs = getPeopleContentionsForBar(proposedBar, { people, teams, phaseBars });
          for (const pc of pcs) {
            const name = pc.resource.kind === 'team'
              ? teams.find(t => t.id === pc.resource.id)?.name
              : people.find(p => p.id === pc.resource.id)?.name;
            if (name && !names.includes(name)) names.push(name);
          }
        }
        setDragPill({ envNames: names, conflict: names.length > 0 });
      } else {
        setDragPill(null);
      }
    }
  }, [bar, moveBar, resizeBar, setDragIndicator, weekWidth, swimlanes, environments, phaseBars, showContention, showPeopleContention, people, teams]);

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

  // Tagged-bar rendering: long bars (>= SHORT_BAR_THRESHOLD wide) render as a
  // neutral card with a coloured left-edge "tag" carrying the phase colour.
  // Short bars fall back to a solid coloured pill so the phase is still
  // identifiable when the label is hidden.
  // In "legacy" bar style the user opts back into solid coloured pills for
  // every bar regardless of width.
  const SHORT_BAR_THRESHOLD = 24;
  const TAG_WIDTH = 5;
  // Rows are placed by centre and drawn with dominantBaseline="central", so
  // there is no hand-tuned baseline nudge to keep in step with the bar height.
  const DATE_FONT_SIZE = FS.badge;
  const DATE_FONT_WEIGHT = FW.badge;
  const LABEL_FONT_SIZE = FS.label;
  const LABEL_FONT_WEIGHT = FW.label;
  const LABEL_GAP = 8;
  const useSolidPill = displayWidth < SHORT_BAR_THRESHOLD || barStyle === 'legacy';
  const clipId = `bar-clip-${bar.id}`;
  // On the neutral card body we use the theme's primary text colour (light on
  // dark, dark on light). The phase-type's own `text` only applies to the
  // solid pill path, where the bar fill is the phase colour.
  const labelFill = useSolidPill ? colors.text : c.TEXT_PRIMARY;

  // ── Shared inner layout ───────────────────────────────────────────────────
  // The bar's contents are one left-to-right run: [date] [chips] [label].
  // Every piece is measured here, once, so the label knows what is in front of
  // it. Previously the chip row and the label each computed their own left
  // edge from the bar origin: the label reserved a slot for the date but knew
  // nothing about the chips, so with dates off they began at exactly the same
  // x and the chips were painted straight over the label — and the row of
  // 16px chips sat bottom-aligned across the label's own line, so there was no
  // vertical escape either.
  // 14px chips: small enough to read as metadata rather than as the loudest
  // thing on the bar, large enough to still hold two initials at the type
  // scale's 9px floor. The old 16px chips carried a white stroke, which made
  // them look pasted on top of the bar instead of set into it.
  const CHIP_R = 7;
  const CHIP_STEP = CHIP_R * 2 + 3;
  const CHIP_MAX_VISIBLE = 3;
  const CHIP_OVERFLOW_W = 16;
  const CHIP_RING = useSolidPill ? colors.fill : c.BG_SURFACE_2;

  const assignedTeams = bar.teamIds
    .map(id => teams.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const assignedPeople = bar.assigneeIds
    .map(id => people.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const chips: Array<{ key: string; color: string; text: string; isTeam: boolean; title: string }> = [
    ...assignedTeams.map(t => ({ key: `t-${t.id}`, color: t.color, text: initials(t.name), isTeam: true, title: `Team: ${t.name}` })),
    ...assignedPeople.map(p => ({ key: `p-${p.id}`, color: p.color, text: initials(p.name), isTeam: false, title: p.role ? `${p.name} (${p.role})` : p.name })),
  ];
  // Mirrors the render condition below — the label must reserve space only
  // when the chips are actually painted, or short bars lose their label for
  // chips that never appear.
  const chipsRendered = !editing && showPeopleIndicators && displayWidth >= 40
    && (chips.length > 0 || isHovered || isSelected);

  const innerLeft = x + (useSolidPill ? 8 : TAG_WIDTH + 7);
  const dateStr = formatDayMonth(startDate);
  const barInnerRight = x + displayWidth - 8;
  const innerW = barInnerRight - innerLeft;
  const dateW = measureText(dateStr, DATE_FONT_SIZE, DATE_FONT_WEIGHT);
  const showDate = showBarDates && innerW >= dateW;

  // Smallest label worth drawing. A truncation like "D…" tells you nothing,
  // so below this the label is dropped rather than rendered as a stub — the
  // full text stays in the tooltip either way.
  const MIN_LABEL_W = measureText('ABC…', LABEL_FONT_SIZE, LABEL_FONT_WEIGHT);

  // ── Two rows, per design-system/components/phase-bar.html ─────────────────
  // The label owns the top row across the bar's whole width; the date and the
  // people chips share a quieter row beneath it. Running all three along one
  // line — which is what this did — spent the left third of every bar on
  // metadata and truncated the phase name to "SIT (…" while two-thirds of the
  // bar sat empty. Splitting the rows gives the label the full span and lets
  // the chips sit right-aligned, so the bar reads left-to-right as name first,
  // detail second.
  const hasSecondRow = showDate || chipsRendered;
  const LABEL_LINE = 10;
  const ROW_GAP = 3;
  const secondRowH = CHIP_R * 2;
  const stackH = hasSecondRow ? LABEL_LINE + ROW_GAP + secondRowH : LABEL_LINE;
  const stackTop = y + (BAR_HEIGHT - stackH) / 2;
  const labelCy = stackTop + LABEL_LINE / 2;
  const metaCy = stackTop + LABEL_LINE + ROW_GAP + secondRowH / 2;

  const chipRowWidthFor = (n: number) =>
    n === 0 ? 0 : n * CHIP_STEP - 3 + (chips.length - n > 0 ? CHIP_OVERFLOW_W : 0);

  // Chips are right-aligned on the meta row, so they shed into "+N" only when
  // they would run into the date coming the other way.
  const metaLeftEnd = innerLeft + (showDate ? dateW : 0);
  let visibleCount = Math.min(CHIP_MAX_VISIBLE, chips.length);
  if (chipsRendered && chips.length > 0) {
    while (visibleCount > 1
      && barInnerRight - chipRowWidthFor(visibleCount) < metaLeftEnd + LABEL_GAP) {
      visibleCount--;
    }
  }

  const visibleChips = chips.slice(0, visibleCount);
  const chipOverflow = chips.length - visibleChips.length;
  const chipRowW = !chipsRendered
    ? 0
    : chips.length > 0
      ? chipRowWidthFor(visibleCount)
      : CHIP_R * 2; // the lone dashed "add" affordance
  const chipsLeft = Math.max(metaLeftEnd + (showDate ? LABEL_GAP : 0), barInnerRight - chipRowW);
  // The label no longer yields to anything horizontally — it has its own row.
  const labelLeft = innerLeft;

  return (
    <g onDoubleClick={(e) => e.stopPropagation()}>

      {useSolidPill ? (
        // ── Short-bar fallback: solid coloured pill ────────────────────────
        <rect
          x={x}
          y={y}
          width={displayWidth}
          height={BAR_HEIGHT}
          rx={BAR_RADIUS}
          ry={BAR_RADIUS}
          fill={colors.fill}
          stroke={isSelected ? c.SELECTION_STROKE : colors.stroke}
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
      ) : (
        // ── Tagged bar: neutral card body + coloured left-edge tag ─────────
        <>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={x}
                y={y}
                width={displayWidth}
                height={BAR_HEIGHT}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
              />
            </clipPath>
          </defs>
          {/* Body — neutral surface, faint brand-coloured frame */}
          <rect
            x={x}
            y={y}
            width={displayWidth}
            height={BAR_HEIGHT}
            rx={BAR_RADIUS}
            ry={BAR_RADIUS}
            fill={c.BG_SURFACE_2}
            stroke={isSelected ? c.SELECTION_STROKE : colors.fill}
            strokeOpacity={isSelected ? 1 : 0.5}
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
          {/* Left-edge tag — clipped to the body's rounded shape so the left
              corners match the body and the right side sits flush */}
          <rect
            x={x}
            y={y}
            width={TAG_WIDTH}
            height={BAR_HEIGHT}
            fill={colors.fill}
            clipPath={`url(#${clipId})`}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}

      {/* Date + label — left-aligned per the v2 phase-bar card: the start
          date (when enabled) always leads, the label follows and truncates
          with an ellipsis to fit. Both are measured against the real font
          (utils/textMeasure) rather than estimated per character, and the
          date sits in a fixed-width slot so every label on the chart starts
          at the same offset instead of jittering with its date's width. */}
      {!editing && (() => {
        const labelSpace = barInnerRight - labelLeft;
        // Below the minimum, draw nothing rather than a one-letter stub.
        const label = labelSpace >= MIN_LABEL_W
          ? fitText(bar.label, labelSpace, LABEL_FONT_SIZE, LABEL_FONT_WEIGHT)
          : '';
        return (
          <>
            {label && (
              <text
                x={labelLeft}
                y={labelCy}
                dominantBaseline="central"
                fill={labelFill}
                fontSize={LABEL_FONT_SIZE}
                fontWeight={LABEL_FONT_WEIGHT}
                fontFamily={FONT_DISPLAY}
                // No tracking: the type card gives the wide tracking to
                // eyebrows and kickers only, and fitText measures without it —
                // so a tracked label overran the width it was truncated to.
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {label}
              </text>
            )}
            {showDate && (
              // Meta row: the date is supporting information, so it takes the
              // secondary ink rather than the label's colour at 70% opacity —
              // a washed-out copy of the primary read as a second heading.
              <text
                x={innerLeft}
                y={metaCy}
                dominantBaseline="central"
                fill={useSolidPill ? labelFill : c.TEXT_SECONDARY}
                fontSize={DATE_FONT_SIZE}
                fontWeight={DATE_FONT_WEIGHT}
                fontFamily={FONT_DISPLAY}
                style={{ pointerEvents: 'none', userSelect: 'none', opacity: useSolidPill ? 0.75 : 1 }}
              >
                {dateStr}
              </text>
            )}
          </>
        );
      })()}

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
          const pillW = Math.max(28, Math.ceil(measureText(text, FS.badge, FW.badge)) + 14);
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
                y={py + pillH / 2}
                dominantBaseline="central"
                textAnchor="middle"
                fill="#ffffff"
                fontSize={FS.badge}
                fontWeight={FW.badge}
                fontFamily={FONT_DISPLAY}
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
                stroke={c.TEXT_SECONDARY}
                strokeDasharray="2 2"
                strokeWidth={1}
              />
              <text
                x={px + pillW / 2}
                y={py + pillH / 2}
                dominantBaseline="central"
                textAnchor="middle"
                fill={c.TEXT_SECONDARY}
                fontSize={FS.badge}
                fontWeight={FW.badge}
                fontFamily={FONT_DISPLAY}
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
              textAlign: 'left',
              paddingLeft: useSolidPill ? 8 : TAG_WIDTH + 7,
              fontSize: LABEL_FONT_SIZE,
              fontWeight: LABEL_FONT_WEIGHT,
              fontFamily: FONT_DISPLAY,
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
                stroke="#ffffff"
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

      {/* People chips — teams first, then person initials, bottom-left of the
          bar. Click opens the multi-select people picker. */}
      {chipsRendered && (() => {
        const hasAny = chips.length > 0;

        // 16px chips: the smallest that fit two-letter initials at the type
        // scale's 9px floor. All chip layout derives from this radius.
        const chipR = CHIP_R;
        const step = CHIP_STEP;
        const visible = visibleChips;
        const overflow = chipOverflow;
        // Sits after the date and before the label, on the shared centreline.
        const baseX = chipsLeft;
        const cyChip = metaCy;
        const openPicker = (e: React.MouseEvent) => {
          e.stopPropagation();
          setPeoplePicker({ x: e.clientX, y: e.clientY });
        };
        const stopPointer = (e: React.PointerEvent) => e.stopPropagation();
        const allNames = chips.map(ch => ch.title).join(', ');

        return (
          <g
            style={{ cursor: 'pointer' }}
            onPointerDown={stopPointer}
            onClick={openPicker}
          >
            <title>{hasAny ? `Allocated: ${allNames}\nClick to change` : 'Allocate people/teams'}</title>
            {hasAny ? (
              <>
                {visible.map((ch, i) => {
                  const cxChip = baseX + chipR + i * step;
                  return (
                    <g key={ch.key} style={{ pointerEvents: 'none' }}>
                      {ch.isTeam ? (
                        <rect
                          x={cxChip - chipR}
                          y={cyChip - chipR}
                          width={chipR * 2}
                          height={chipR * 2}
                          rx={3}
                          ry={3}
                          fill={ch.color}
                          stroke={CHIP_RING}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <circle cx={cxChip} cy={cyChip} r={chipR} fill={ch.color} stroke={CHIP_RING} strokeWidth={1.5} />
                      )}
                      <text
                        x={cxChip}
                        y={cyChip}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={FS.badge}
                        fontWeight={FW.badge}
                        fill="#ffffff"
                        fontFamily={FONT_DISPLAY}
                        style={{ userSelect: 'none' }}
                      >
                        {ch.text}
                      </text>
                    </g>
                  );
                })}
                {overflow > 0 && (
                  <text
                    x={baseX + chipR + visible.length * step - chipR + 2}
                    y={cyChip}
                    dominantBaseline="central"
                    fontSize={FS.badge}
                    fontWeight={FW.badge}
                    fill={c.TEXT_SECONDARY}
                    fontFamily={FONT_DISPLAY}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    +{overflow}
                  </text>
                )}
                {/* Widened invisible hit area over the chip row */}
                <rect
                  x={baseX - 2}
                  y={cyChip - chipR - 2}
                  width={visible.length * step + (overflow > 0 ? 14 : 0) + 4}
                  height={chipR * 2 + 4}
                  fill="#ffffff"
                  fillOpacity={0.001}
                />
              </>
            ) : (
              // Unassigned affordance on hover/selection — dashed circle with "+"
              // mirroring the "+ env" pattern.
              <>
                <circle cx={baseX + chipR} cy={cyChip} r={chipR + 1} fill="#ffffff" fillOpacity={0.001} />
                <circle
                  cx={baseX + chipR}
                  cy={cyChip}
                  r={chipR}
                  fill="none"
                  stroke={isSelected ? '#3d3930' : '#7a7264'}
                  strokeDasharray="1.5 1.5"
                  strokeWidth={1.25}
                  style={{ pointerEvents: 'none' }}
                />
                <line x1={baseX + chipR - 2} y1={cyChip} x2={baseX + chipR + 2} y2={cyChip} stroke={isSelected ? '#3d3930' : '#7a7264'} strokeWidth={1.25} style={{ pointerEvents: 'none' }} />
                <line x1={baseX + chipR} y1={cyChip - 2} x2={baseX + chipR} y2={cyChip + 2} stroke={isSelected ? '#3d3930' : '#7a7264'} strokeWidth={1.25} style={{ pointerEvents: 'none' }} />
              </>
            )}
          </g>
        );
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

      {/* People picker popover (anchored to chip click coordinates) */}
      {peoplePicker && (
        <PeoplePickerPopover
          title="Allocated to"
          currentAssigneeIds={bar.assigneeIds}
          currentTeamIds={bar.teamIds}
          x={peoplePicker.x}
          y={peoplePicker.y}
          onChange={allocation => setBarPeople(bar.id, allocation)}
          onClose={() => setPeoplePicker(null)}
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
