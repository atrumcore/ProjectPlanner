import { useMemo, type ReactNode } from 'react';
import { useGanttStore } from '../../store/useGanttStore';
import { useAssistantStore } from '../../ai/useAssistantStore';
import { getContentions, getPeopleContentions } from '../../utils/contention';
import type { RailTab } from '../../types/gantt';

/* Monoline 16px icons — light stroke, geometric, currentColor, matching the
 * BBD icon language (brand CI: minimal, consistent-weight, monoline). */
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Sliders — properties/inspector. */
const InspectorIcon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <line x1="2.5" y1="5" x2="13.5" y2="5" />
    <circle cx="6" cy="5" r="1.8" fill="var(--bg-header)" />
    <line x1="2.5" y1="11" x2="13.5" y2="11" />
    <circle cx="10" cy="11" r="1.8" fill="var(--bg-header)" />
  </svg>
);

/** Checklist — notes & action items. */
const NotesIcon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <polyline points="2.5,4.2 3.4,5.1 5,3.4" />
    <line x1="7" y1="4.2" x2="13.5" y2="4.2" />
    <polyline points="2.5,8.2 3.4,9.1 5,7.4" />
    <line x1="7" y1="8.2" x2="13.5" y2="8.2" />
    <line x1="7" y1="12.2" x2="13.5" y2="12.2" />
  </svg>
);

/** Stacked layers — environments/infrastructure. */
const EnvironmentsIcon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M8 2.2 13.8 5.2 8 8.2 2.2 5.2 Z" />
    <path d="M2.2 8.2 8 11.2 13.8 8.2" />
    <path d="M2.2 11.2 8 14.2 13.8 11.2" />
  </svg>
);

/** Two people — roster. */
const PeopleIcon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="5.8" cy="5.2" r="2.4" />
    <path d="M1.8 13.8c0-2.6 1.8-4.2 4-4.2s4 1.6 4 4.2" />
    <path d="M10.6 3.4a2.4 2.4 0 0 1 0 3.9" />
    <path d="M11.6 9.9c1.6 0.5 2.6 1.9 2.6 3.9" />
  </svg>
);

/** Four-point spark — the AI assistant. */
const AssistantIcon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M8 1.8 L9.6 6.4 L14.2 8 L9.6 9.6 L8 14.2 L6.4 9.6 L1.8 8 L6.4 6.4 Z" />
  </svg>
);

interface TabDef {
  id: RailTab;
  icon: ReactNode;
  title: string;
}

const TABS: TabDef[] = [
  { id: 'inspector', icon: InspectorIcon, title: 'Inspector (Ctrl+I)' },
  { id: 'items', icon: NotesIcon, title: 'Open Items — actions, dependencies, risks (Ctrl+Shift+N)' },
  { id: 'environments', icon: EnvironmentsIcon, title: 'Environments & Contention (Ctrl+Shift+E)' },
  { id: 'people', icon: PeopleIcon, title: 'People & Teams (Ctrl+Shift+P)' },
  { id: 'assistant', icon: AssistantIcon, title: 'AI assistant (Ctrl+Shift+C)' },
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

  const trackedItems = useGanttStore(s => s.trackedItems);
  const environments = useGanttStore(s => s.environments);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const people = useGanttStore(s => s.people);
  const teams = useGanttStore(s => s.teams);
  const assistantPending = useAssistantStore(s => s.pending !== null);

  const openItems = useMemo(() => trackedItems.filter(i => !i.done).length, [trackedItems]);
  const envConflicts = useMemo(
    () => getContentions({ environments, swimlanes, phaseBars }).length,
    [environments, swimlanes, phaseBars]
  );
  const peopleConflicts = useMemo(
    () => getPeopleContentions({ people, teams, phaseBars }).length,
    [people, teams, phaseBars]
  );

  const badgeFor = (id: RailTab): { count: number; kind: 'info' | 'conflict' } | null => {
    if (id === 'items') return openItems > 0 ? { count: openItems, kind: 'info' } : null;
    if (id === 'environments') return envConflicts > 0 ? { count: envConflicts, kind: 'conflict' } : null;
    if (id === 'people') return peopleConflicts > 0 ? { count: peopleConflicts, kind: 'conflict' } : null;
    // Un-actioned AI proposal waiting — visible even with the panel closed.
    if (id === 'assistant') return assistantPending ? { count: 1, kind: 'info' } : null;
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
            {tab.icon}
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
