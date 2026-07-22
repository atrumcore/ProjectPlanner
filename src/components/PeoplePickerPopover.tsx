import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGanttStore } from '../store/useGanttStore';

interface Props {
  /** Popover heading, e.g. "Assigned to" (bars) or "Owners" (swimlanes). */
  title: string;
  currentAssigneeIds: string[];
  currentTeamIds: string[];
  /** Anchor in viewport coordinates (typically the click event clientX/Y). */
  x: number;
  y: number;
  /** Called on every toggle with the full updated allocation. */
  onChange: (allocation: { assigneeIds: string[]; teamIds: string[] }) => void;
  onClose: () => void;
}

/**
 * Multi-select popover for allocating teams and people — the people analogue
 * of BarEnvPickerPopover (and it reuses its CSS classes). Teams are listed
 * first, then people grouped by team. Every click applies immediately; the
 * popover stays open so several resources can be picked in one visit.
 */
export default function PeoplePickerPopover({
  title, currentAssigneeIds, currentTeamIds, x, y, onChange, onClose,
}: Props) {
  const people = useGanttStore(s => s.people);
  const teams = useGanttStore(s => s.teams);
  const togglePeoplePanel = useGanttStore(s => s.togglePeoplePanel);
  const peoplePanelOpen = useGanttStore(s => s.peoplePanelOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp to viewport on mount.
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - rect.width - 4),
      top: Math.min(y + 6, window.innerHeight - rect.height - 4),
    });
  }, [x, y]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onClick);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggleTeam = (id: string) => {
    const next = currentTeamIds.includes(id)
      ? currentTeamIds.filter(t => t !== id)
      : [...currentTeamIds, id];
    onChange({ assigneeIds: currentAssigneeIds, teamIds: next });
  };

  const togglePerson = (id: string) => {
    const next = currentAssigneeIds.includes(id)
      ? currentAssigneeIds.filter(p => p !== id)
      : [...currentAssigneeIds, id];
    onChange({ assigneeIds: next, teamIds: currentTeamIds });
  };

  // People grouped: teamed people in team order, then unteamed.
  const orderedTeams = [...teams].sort((a, b) => a.order - b.order);
  const orderedPeople = [...people].sort((a, b) => a.order - b.order);
  const teamedPeople = orderedTeams.flatMap(t => orderedPeople.filter(p => p.teamId === t.id));
  const unteamed = orderedPeople.filter(p => !p.teamId || !teams.some(t => t.id === p.teamId));
  const groupedPeople = [...teamedPeople, ...unteamed];
  const teamNameById = new Map(teams.map(t => [t.id, t.name]));

  return createPortal(
    <div
      ref={ref}
      className="bar-env-popover people-picker-popover"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="bar-env-popover-title">{title}</div>

      {teams.length === 0 && people.length === 0 ? (
        <div className="people-picker-empty">No people or teams yet.</div>
      ) : (
        <>
          {orderedTeams.length > 0 && (
            <div className="people-picker-group-label">Teams</div>
          )}
          {orderedTeams.map(team => {
            const active = currentTeamIds.includes(team.id);
            return (
              <button
                key={team.id}
                className={`bar-env-popover-item${active ? ' active' : ''}`}
                onClick={() => toggleTeam(team.id)}
              >
                <span className="bar-env-popover-dot people-picker-team-dot" style={{ background: team.color }} />
                <span className="bar-env-popover-name">{team.name}</span>
                {active && <span className="bar-env-popover-check">✓</span>}
              </button>
            );
          })}
          {groupedPeople.length > 0 && (
            <div className="people-picker-group-label">People</div>
          )}
          {groupedPeople.map(person => {
            const active = currentAssigneeIds.includes(person.id);
            const teamName = person.teamId ? teamNameById.get(person.teamId) : undefined;
            return (
              <button
                key={person.id}
                className={`bar-env-popover-item${active ? ' active' : ''}`}
                onClick={() => togglePerson(person.id)}
              >
                <span className="bar-env-popover-dot" style={{ background: person.color }} />
                <span className="bar-env-popover-name">
                  {person.name}
                  {(person.role || teamName) && (
                    <span className="people-picker-meta">
                      {' '}· {[person.role, teamName].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {active && <span className="bar-env-popover-check">✓</span>}
              </button>
            );
          })}
        </>
      )}

      <div className="bar-env-popover-divider" />
      <button
        className="bar-env-popover-link"
        onClick={() => {
          if (!peoplePanelOpen) togglePeoplePanel();
          onClose();
        }}
      >
        Manage people…
      </button>
    </div>,
    document.body
  );
}
