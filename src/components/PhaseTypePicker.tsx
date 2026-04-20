import { useEffect, useRef, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { PhaseType } from '../types/gantt';
import { PHASE_PRESETS } from '../data/phasePresets';
import { PHASE_TYPE_OPTIONS } from '../data/phasePresets';
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
  const pickerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((phaseType: PhaseType) => {
    updatePhaseBar(barId, {
      phaseType,
      label: PHASE_PRESETS[phaseType].label,
      colorOverride: undefined,
    });
    clearCreatingBar();
  }, [barId, updatePhaseBar, clearCreatingBar]);

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
      {PHASE_TYPE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          className="phase-type-circle"
          title={opt.label}
          style={{
            background: PHASE_PRESETS[opt.value].fill,
            borderColor: PHASE_PRESETS[opt.value].stroke,
          }}
          onClick={() => handleSelect(opt.value)}
        />
      ))}
    </div>,
    document.body
  );
}
