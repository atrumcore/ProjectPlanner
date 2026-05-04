import { useGanttStore } from '../store/useGanttStore';
import { getMonthsFromWeeks, getWeeksForMonth } from '../utils/dateUtils';
import DropdownMenu from './DropdownMenu';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
}

export default function ViewMenu({ anchor, onClose }: Props) {
  // Notes panel
  const notesPanelOpen = useGanttStore(s => s.notesPanelOpen);
  const toggleNotesPanel = useGanttStore(s => s.toggleNotesPanel);

  // Visibility toggles
  const showWeekends = useGanttStore(s => s.showWeekends);
  const showHolidays = useGanttStore(s => s.showHolidays);
  const showMilestones = useGanttStore(s => s.showMilestones);
  const showBarDates = useGanttStore(s => s.showBarDates);
  const showMonthDates = useGanttStore(s => s.showMonthDates);
  const showEnvIndicators = useGanttStore(s => s.showEnvIndicators);
  const showEnvMarquees = useGanttStore(s => s.showEnvMarquees);
  const showContention = useGanttStore(s => s.showContention);
  const toggleWeekends = useGanttStore(s => s.toggleWeekends);
  const toggleHolidays = useGanttStore(s => s.toggleHolidays);
  const toggleMilestones = useGanttStore(s => s.toggleMilestones);
  const toggleBarDates = useGanttStore(s => s.toggleBarDates);
  const toggleMonthDates = useGanttStore(s => s.toggleMonthDates);
  const toggleEnvIndicators = useGanttStore(s => s.toggleEnvIndicators);
  const toggleEnvMarquees = useGanttStore(s => s.toggleEnvMarquees);
  const toggleContention = useGanttStore(s => s.toggleContention);

  // Timeline range
  const timeline = useGanttStore(s => s.timeline);
  const extendTimeline = useGanttStore(s => s.extendTimeline);
  const prependMonth = useGanttStore(s => s.prependMonth);
  const trimStart = useGanttStore(s => s.trimStart);
  const trimEnd = useGanttStore(s => s.trimEnd);

  const months = getMonthsFromWeeks(timeline.startMonth, timeline.startYear, timeline.totalWeeks);
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const endYear = timeline.startYear + Math.floor((timeline.startMonth + months.length - 1) / 12);
  const rangeLabel = `${firstMonth?.name ?? ''} ${timeline.startYear} \u2014 ${lastMonth?.name ?? ''} ${endYear}`;

  const firstMonthWeeks = getWeeksForMonth(timeline.startMonth, timeline.startYear);
  const endMonthIdx = (timeline.startMonth + months.length - 1) % 12;
  const lastMonthWeeks = getWeeksForMonth(endMonthIdx, endYear);
  const nextMonthIdx = (timeline.startMonth + months.length) % 12;
  const nextMonthYear = timeline.startYear + Math.floor((timeline.startMonth + months.length) / 12);
  const nextMonthWeeks = getWeeksForMonth(nextMonthIdx, nextMonthYear);

  return (
    <DropdownMenu anchor={anchor} onClose={onClose}>
      <label className="view-menu-item">
        <input type="checkbox" checked={notesPanelOpen} onChange={toggleNotesPanel} />
        Notes panel
      </label>
      <div className="view-menu-divider" />
      <div className="view-menu-group-label">Overlays</div>
      <label className="view-menu-item">
        <input type="checkbox" checked={showWeekends} onChange={toggleWeekends} />
        <span className="view-menu-swatch" style={{ background: 'rgba(46, 125, 50, 0.35)' }} />
        Weekends
      </label>
      <label className="view-menu-item">
        <input type="checkbox" checked={showHolidays} onChange={toggleHolidays} />
        <span className="view-menu-swatch view-menu-swatch-dash" />
        Public holidays
      </label>
      <label className="view-menu-item">
        <input type="checkbox" checked={showMilestones} onChange={toggleMilestones} />
        <span className="view-menu-swatch" style={{ background: '#d5e8d4', borderColor: '#82b366' }} />
        Release dates
      </label>
      <label className="view-menu-item">
        <input type="checkbox" checked={showBarDates} onChange={toggleBarDates} />
        <span className="view-menu-swatch-blank">Aa</span>
        Phase-bar start dates
      </label>

      <div className="view-menu-divider" />
      <div className="view-menu-group-label">Environments</div>
      <label className="view-menu-item">
        <input type="checkbox" checked={showEnvIndicators} onChange={toggleEnvIndicators} />
        <span className="view-menu-swatch" style={{ background: '#1e88e5', borderColor: '#1565c0' }} />
        Environment indicators (dots & pills)
      </label>
      <label className="view-menu-item">
        <input type="checkbox" checked={showEnvMarquees} onChange={toggleEnvMarquees} />
        <span className="view-menu-swatch view-menu-swatch-dash" style={{ borderColor: '#1e88e5' }} />
        Environment marquees
      </label>
      <label className="view-menu-item">
        <input type="checkbox" checked={showContention} onChange={toggleContention} />
        <span className="view-menu-swatch" style={{ background: '#e53935', borderColor: '#b71c1c' }} />
        Contention ribbons & highlights
      </label>

      <div className="view-menu-divider" />
      <div className="view-menu-group-label">Header</div>
      <label className="view-menu-item">
        <input type="checkbox" checked={showMonthDates} onChange={toggleMonthDates} />
        <span className="view-menu-swatch-blank">1/15/28</span>
        Day markers (instead of week numbers)
      </label>

      <div className="view-menu-divider" />
      <div className="view-menu-group-label">Timeline Range</div>
      <div className="timeline-range-row">
        <button onClick={prependMonth} title="Add month before start">+ Start</button>
        <button onClick={trimStart} title="Remove first month" disabled={timeline.totalWeeks <= firstMonthWeeks}>- Start</button>
        <span className="timeline-range-label">{rangeLabel}</span>
        <button onClick={() => trimEnd(lastMonthWeeks)} title="Remove last month" disabled={timeline.totalWeeks <= lastMonthWeeks}>- End</button>
        <button onClick={() => extendTimeline(nextMonthWeeks)} title="Add month after end">+ End</button>
      </div>
    </DropdownMenu>
  );
}
