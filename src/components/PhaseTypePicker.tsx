import { useEffect, useRef, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { PhaseType } from '../types/gantt';
import { useGanttStore } from '../store/useGanttStore';

interface Props {
  barId: string;
  svgRef: RefObject<SVGSVGElement | null>;
  barX: number;
  barY: number;
  barWidth: number;
}

export default function PhaseTypePicker({ barId, svgRef, barX, barY, barWidth }: Props) {
  const updatePhaseBar = useGanttStore(s => s.updatePhaseBar);
  const clearCreatingBar = useGanttStore(s => s.clearCreatingBar);
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const environments = useGanttStore(s => s.environments);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const togglePhaseTypesModal = useGanttStore(s => s.togglePhaseTypesModal);
  const toggleEnvironmentsPanel = useGanttStore(s => s.toggleEnvironmentsPanel);
  const environmentsPanelOpen = useGanttStore(s => s.environmentsPanelOpen);
  const setBarEnvironment = useGanttStore(s => s.setBarEnvironment);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Track the bar's current env so the active swatch reflects state changes.
  const currentEnvId = phaseBars.find(b => b.id === barId)?.environmentId ?? null;

  const handleSelectPhase = useCallback((phaseType: PhaseType) => {
    const def = phaseTypes.find(t => t.id === phaseType);
    updatePhaseBar(barId, {
      phaseType,
      label: def?.label ?? phaseType.toUpperCase(),
      colorOverride: undefined,
    });
    // Phase type is the primary action — pick it last and we dismiss.
    clearCreatingBar();
  }, [barId, updatePhaseBar, clearCreatingBar, phaseTypes]);

  const handleSelectEnv = useCallback((envId: string | null) => {
    // Env clicks update without dismissing so the user can still pick a
    // phase type (or click outside) afterwards.
    setBarEnvironment(barId, envId);
  }, [barId, setBarEnvironment]);

  // Dismiss on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        clearCreatingBar();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearCreatingBar();
    };
    // Delay listener to avoid immediate dismiss from the creating click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [clearCreatingBar]);

  // Compute screen position from SVG coordinates
  if (!svgRef.current) return null;
  const svgRect = svgRef.current.getBoundingClientRect();
  const scrollParent = svgRef.current.parentElement;
  if (!scrollParent) return null;

  const screenX = svgRect.left + barX - scrollParent.scrollLeft + barWidth / 2;
  const screenY = svgRect.top + barY - scrollParent.scrollTop + 6;

  return createPortal(
    <div
      ref={pickerRef}
      className="phase-type-picker"
      style={{ left: screenX, top: screenY }}
    >
      <div className="phase-type-picker-row">
        {phaseTypes.map(t => (
          <button
            key={t.id}
            className="phase-type-circle"
            title={t.name}
            style={{ background: t.fill, borderColor: t.stroke }}
            onClick={() => handleSelectPhase(t.id)}
          />
        ))}
        <button
          className="phase-type-edit-btn"
          title="Edit phase types..."
          onClick={() => {
            clearCreatingBar();
            togglePhaseTypesModal();
          }}
        >
          +
        </button>
      </div>

      {environments.length > 0 && (
        <div className="phase-type-picker-row phase-type-picker-env-row">
          <button
            className={`env-pill-pick env-pill-pick-none${currentEnvId === null ? ' active' : ''}`}
            title="No environment"
            onClick={() => handleSelectEnv(null)}
          >
            none
          </button>
          {environments.map(env => (
            <button
              key={env.id}
              className={`env-pill-pick${currentEnvId === env.id ? ' active' : ''}`}
              title={env.name}
              style={{ background: env.color }}
              onClick={() => handleSelectEnv(env.id)}
            >
              <span>{env.name}</span>
            </button>
          ))}
        </div>
      )}

      {environments.length === 0 && (
        <div className="phase-type-picker-row">
          <button
            className="phase-type-edit-btn phase-type-edit-btn-wide"
            title="Create environments..."
            onClick={() => {
              clearCreatingBar();
              if (!environmentsPanelOpen) toggleEnvironmentsPanel();
            }}
          >
            + add environments
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
