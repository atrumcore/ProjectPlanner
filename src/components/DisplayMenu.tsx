import { useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import { useTheme } from '../theme/ThemeContext';
import { getMonthsFromWeeks, getWeeksForMonth } from '../utils/dateUtils';
import { matchDisplayPreset, PRESET_LABELS, type DisplayPreset } from '../data/displayPresets';
import DropdownMenu from './DropdownMenu';

interface Props {
  anchor: DOMRect;
  onClose: () => void;
}

const PRESETS: DisplayPreset[] = ['minimal', 'delivery', 'workload'];

/**
 * Display menu — replaces the old View menu. Leads with the three presets
 * (Minimal / Delivery / Workload); the full toggle list lives behind
 * "Customise display", and any manual toggle simply reads as Custom.
 */
export default function DisplayMenu({ anchor, onClose }: Props) {
  const { theme, setTheme } = useTheme();
  const barStyle = useGanttStore(s => s.barStyle);
  const setBarStyle = useGanttStore(s => s.setBarStyle);
  const setDisplayPreset = useGanttStore(s => s.setDisplayPreset);

  const showWeekends = useGanttStore(s => s.showWeekends);
  const showHolidays = useGanttStore(s => s.showHolidays);
  const showMilestones = useGanttStore(s => s.showMilestones);
  const showBarDates = useGanttStore(s => s.showBarDates);
  const showMonthDates = useGanttStore(s => s.showMonthDates);
  const showEnvIndicators = useGanttStore(s => s.showEnvIndicators);
  const showEnvMarquees = useGanttStore(s => s.showEnvMarquees);
  const showContention = useGanttStore(s => s.showContention);
  const showPeopleIndicators = useGanttStore(s => s.showPeopleIndicators);
  const showPeopleContention = useGanttStore(s => s.showPeopleContention);
  const toggleWeekends = useGanttStore(s => s.toggleWeekends);
  const toggleHolidays = useGanttStore(s => s.toggleHolidays);
  const toggleMilestones = useGanttStore(s => s.toggleMilestones);
  const toggleBarDates = useGanttStore(s => s.toggleBarDates);
  const toggleMonthDates = useGanttStore(s => s.toggleMonthDates);
  const toggleEnvIndicators = useGanttStore(s => s.toggleEnvIndicators);
  const toggleEnvMarquees = useGanttStore(s => s.toggleEnvMarquees);
  const toggleContention = useGanttStore(s => s.toggleContention);
  const togglePeopleIndicators = useGanttStore(s => s.togglePeopleIndicators);
  const togglePeopleContention = useGanttStore(s => s.togglePeopleContention);

  const activePreset = matchDisplayPreset({
    showWeekends, showHolidays, showMilestones, showBarDates,
    showEnvIndicators, showEnvMarquees, showContention,
    showPeopleIndicators, showPeopleContention,
  });

  const [customiseOpen, setCustomiseOpen] = useState(activePreset === null);

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
  const rangeLabel = `${firstMonth?.name ?? ''} ${timeline.startYear} — ${lastMonth?.name ?? ''} ${endYear}`;

  const firstMonthWeeks = getWeeksForMonth(timeline.startMonth, timeline.startYear);
  const endMonthIdx = (timeline.startMonth + months.length - 1) % 12;
  const lastMonthWeeks = getWeeksForMonth(endMonthIdx, endYear);
  const nextMonthIdx = (timeline.startMonth + months.length) % 12;
  const nextMonthYear = timeline.startYear + Math.floor((timeline.startMonth + months.length) / 12);
  const nextMonthWeeks = getWeeksForMonth(nextMonthIdx, nextMonthYear);

  return (
    <DropdownMenu anchor={anchor} onClose={onClose}>
      <div className="view-menu-group-label">Preset</div>
      {PRESETS.map(p => (
        <label key={p} className="view-menu-item display-preset-item">
          <input
            type="radio"
            name="bbd-planner-display-preset"
            checked={activePreset === p}
            onChange={() => setDisplayPreset(p)}
          />
          <span className="display-preset-name">{PRESET_LABELS[p].name}</span>
          <span className="display-preset-hint">{PRESET_LABELS[p].hint}</span>
        </label>
      ))}
      {activePreset === null && (
        <label className="view-menu-item display-preset-item">
          <input type="radio" name="bbd-planner-display-preset" checked readOnly />
          <span className="display-preset-name">Custom</span>
          <span className="display-preset-hint">Your own mix (below)</span>
        </label>
      )}

      <div className="view-menu-divider" />
      <button
        className="view-menu-disclosure"
        onClick={() => setCustomiseOpen(v => !v)}
      >
        {customiseOpen ? '▾' : '▸'} Customise display
      </button>

      {customiseOpen && (
        <>
          <label className="view-menu-item">
            <input type="checkbox" checked={showWeekends} onChange={toggleWeekends} />
            <span className="view-menu-swatch" style={{ background: 'rgba(255, 255, 255, 0.16)' }} />
            Weekends
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showHolidays} onChange={toggleHolidays} />
            <span className="view-menu-swatch view-menu-swatch-dash" />
            Public holidays
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showMilestones} onChange={toggleMilestones} />
            <span className="view-menu-swatch" style={{ background: 'var(--milestone-fill)', borderColor: 'var(--milestone-stroke)' }} />
            Go-live markers
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showBarDates} onChange={toggleBarDates} />
            <span className="view-menu-swatch-blank">Aa</span>
            Phase-bar start dates
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showEnvIndicators} onChange={toggleEnvIndicators} />
            <span className="view-menu-swatch" style={{ background: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }} />
            Environment indicators
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showEnvMarquees} onChange={toggleEnvMarquees} />
            <span className="view-menu-swatch view-menu-swatch-dash" style={{ borderColor: 'var(--accent-secondary)' }} />
            Environment marquees
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showContention} onChange={toggleContention} />
            <span className="view-menu-swatch" style={{ background: 'var(--contention)', borderColor: 'var(--contention)' }} />
            Contention ribbons
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showPeopleIndicators} onChange={togglePeopleIndicators} />
            <span className="view-menu-swatch" style={{ background: '#5e35b1', borderColor: '#5e35b1', borderRadius: '50%' }} />
            People chips on bars
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showPeopleContention} onChange={togglePeopleContention} />
            <span className="view-menu-swatch" style={{ background: '#d81b60', borderColor: '#d81b60' }} />
            Double-booking ribbons
          </label>
          <label className="view-menu-item">
            <input type="checkbox" checked={showMonthDates} onChange={toggleMonthDates} />
            <span className="view-menu-swatch-blank">1/15</span>
            Day markers in header
          </label>
        </>
      )}

      <div className="view-menu-divider" />
      <div className="view-menu-group-label">Bar style</div>
      <div className="display-segmented">
        <button className={barStyle === 'tagged' ? 'on' : ''} onClick={() => setBarStyle('tagged')}>Tagged</button>
        <button className={barStyle === 'legacy' ? 'on' : ''} onClick={() => setBarStyle('legacy')}>Solid</button>
      </div>
      <div className="view-menu-group-label">Theme</div>
      <div className="display-segmented">
        <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
        <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
      </div>

      <div className="view-menu-divider" />
      <div className="view-menu-group-label">Timeline range</div>
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
