import { useMemo } from 'react';
import { useGanttStore } from '../../store/useGanttStore';
import { getContentions, getPeopleContentions } from '../../utils/contention';
import type { RailTab } from '../../types/gantt';

interface TabDef {
  id: RailTab;
  icon: string;
  title: string;
}

const TABS: TabDef[] = [
  { id: 'inspector', icon: 'ⓘ', title: 'Inspector (Ctrl+I)' },
  { id: 'notes', icon: '☰', title: 'Notes & Action Items (Ctrl+Shift+N)' },
  { id: 'environments', icon: '▣', title: 'Environments & Contention (Ctrl+Shift+E)' },
  { id: 'people', icon: '◉', title: 'People & Teams (Ctrl+Shift+P)' },
];

/**
 * The right-edge rail: a 44px strip of tabs that is always visible. One panel
 * opens at a time (RailPanel); clicking the active tab closes it. Badges
 * always compute — conflict counts stay visible even when the display toggles
 * hide ribbons on the canvas, so the signal never silently disappears.
 * Sits outside .gantt-container so exports never capture it.
 */
export default function Rail() {
  const railTab = useGanttStore(s => s.railTab);
  const toggleRailTab = useGanttStore(s => s.toggleRailTab);

  const actionItems = useGanttStore(s => s.actionItems);
  const environments = useGanttStore(s => s.environments);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const people = useGanttStore(s => s.people);
  const teams = useGanttStore(s => s.teams);

  const openNotes = useMemo(() => actionItems.filter(i => !i.done).length, [actionItems]);
  const envConflicts = useMemo(
    () => getContentions({ environments, swimlanes, phaseBars }).length,
    [environments, swimlanes, phaseBars]
  );
  const peopleConflicts = useMemo(
    () => getPeopleContentions({ people, teams, phaseBars }).length,
    [people, teams, phaseBars]
  );

  const badgeFor = (id: RailTab): { count: number; kind: 'info' | 'conflict' } | null => {
    if (id === 'notes') return openNotes > 0 ? { count: openNotes, kind: 'info' } : null;
    if (id === 'environments') return envConflicts > 0 ? { count: envConflicts, kind: 'conflict' } : null;
    if (id === 'people') return peopleConflicts > 0 ? { count: peopleConflicts, kind: 'conflict' } : null;
    return null;
  };

  return (
    <div className="rail" role="tablist" aria-label="Panels">
      {TABS.map(tab => {
        const badge = badgeFor(tab.id);
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={railTab === tab.id}
            className={`rail-tab${railTab === tab.id ? ' active' : ''}`}
            title={tab.title}
            onClick={() => toggleRailTab(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {badge && (
              <span className={`rail-badge${badge.kind === 'info' ? ' info' : ''}`}>
                {badge.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
