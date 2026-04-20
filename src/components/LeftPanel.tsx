import { useGanttStore } from '../store/useGanttStore';
import type { Swimlane } from '../types/gantt';
import { useSectionedLanes } from '../hooks/useSectionedLanes';
import { useState, useMemo, useCallback, useEffect, useRef, forwardRef } from 'react';
import RichTextEditor from './RichTextEditor';

interface Props {
  onScroll: (scrollTop: number) => void;
  width: number;
}

const LeftPanel = forwardRef<HTMLDivElement, Props>(({ onScroll, width }, ref) => {
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const updateSwimlane = useGanttStore(s => s.updateSwimlane);
  const removeSwimlane = useGanttStore(s => s.removeSwimlane);
  const reorderSwimlane = useGanttStore(s => s.reorderSwimlane);
  const quickAddPhaseBar = useGanttStore(s => s.quickAddPhaseBar);
  const addMilestone = useGanttStore(s => s.addMilestone);
  const addSwimlane = useGanttStore(s => s.addSwimlane);
  const addSection = useGanttStore(s => s.addSection);
  const removeSection = useGanttStore(s => s.removeSection);
  const updateSection = useGanttStore(s => s.updateSection);
  const actionItems = useGanttStore(s => s.actionItems);
  const openNotesPanelForSwimlane = useGanttStore(s => s.openNotesPanelForSwimlane);
  const openNotesPanelFiltered = useGanttStore(s => s.openNotesPanelFiltered);
  const updateActionItem = useGanttStore(s => s.updateActionItem);

  const sectionedLanes = useSectionedLanes(sections, swimlanes);

  // Note counts per swimlane (only open items)
  const noteCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of actionItems) {
      if (item.swimlaneId && !item.done) {
        map.set(item.swimlaneId, (map.get(item.swimlaneId) || 0) + 1);
      }
    }
    return map;
  }, [actionItems]);

  // Drag reorder
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null);
  const [actionItemHoverLaneId, setActionItemHoverLaneId] = useState<string | null>(null);

  // Swimlane right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; laneId: string } | null>(null);
  const [ctxPos, setCtxPos] = useState({ left: 0, top: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Section right-click context menu
  const [secCtxMenu, setSecCtxMenu] = useState<{ x: number; y: number; sectionId: string } | null>(null);
  const [secCtxPos, setSecCtxPos] = useState({ left: 0, top: 0 });
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false);
  const secCtxRef = useRef<HTMLDivElement>(null);

  // Clamp swimlane context menu to viewport
  useEffect(() => {
    if (!ctxMenu || !ctxRef.current) return;
    const rect = ctxRef.current.getBoundingClientRect();
    setCtxPos({
      left: Math.min(ctxMenu.x, window.innerWidth - rect.width - 4),
      top: Math.min(ctxMenu.y, window.innerHeight - rect.height - 4),
    });
  }, [ctxMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [ctxMenu]);

  // Clamp section context menu to viewport
  useEffect(() => {
    if (!secCtxMenu || !secCtxRef.current) return;
    const rect = secCtxRef.current.getBoundingClientRect();
    setSecCtxPos({
      left: Math.min(secCtxMenu.x, window.innerWidth - rect.width - 4),
      top: Math.min(secCtxMenu.y, window.innerHeight - rect.height - 4),
    });
  }, [secCtxMenu]);

  useEffect(() => {
    if (!secCtxMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (secCtxRef.current && !secCtxRef.current.contains(e.target as Node)) {
        setSecCtxMenu(null);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [secCtxMenu]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll((e.target as HTMLDivElement).scrollTop);
  };

  // Move swimlane to different section
  const moveToSection = useCallback((lane: Swimlane, newSection: string) => {
    if (lane.section === newSection) return;
    const targetLanes = swimlanes.filter(s => s.section === newSection);
    const maxOrder = targetLanes.reduce((max, s) => Math.max(max, s.order), -1);
    updateSwimlane(lane.id, { section: newSection, order: maxOrder + 1 });
  }, [swimlanes, updateSwimlane]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, laneId: string) => {
    setDragId(laneId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', laneId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, laneId: string) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/x-action-item')) {
      e.dataTransfer.dropEffect = 'link';
      setActionItemHoverLaneId(laneId);
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropTarget({ id: laneId, position: e.clientY < midY ? 'above' : 'below' });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
    setActionItemHoverLaneId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetLane: Swimlane, sectionLanes: Swimlane[]) => {
    e.preventDefault();
    const actionItemId = e.dataTransfer.getData('application/x-action-item');
    if (actionItemId) {
      updateActionItem(actionItemId, { swimlaneId: targetLane.id });
      setActionItemHoverLaneId(null);
      return;
    }
    if (!dragId) return;
    const dragged = swimlanes.find(s => s.id === dragId);
    if (!dragged || dragged.id === targetLane.id) {
      setDragId(null);
      setDropTarget(null);
      return;
    }

    const targetSection = targetLane.section;
    const sorted = sectionLanes.sort((a, b) => a.order - b.order);
    const targetIdx = sorted.findIndex(s => s.id === targetLane.id);
    const insertIdx = dropTarget?.position === 'above' ? targetIdx : targetIdx + 1;

    if (dragged.section !== targetSection) {
      updateSwimlane(dragged.id, { section: targetSection });
    }

    const withoutDragged = sorted.filter(s => s.id !== dragged.id);
    withoutDragged.splice(insertIdx > withoutDragged.length ? withoutDragged.length : insertIdx, 0, dragged);
    withoutDragged.forEach((s, i) => {
      reorderSwimlane(s.id, i);
    });

    setDragId(null);
    setDropTarget(null);
  }, [dragId, dropTarget, swimlanes, updateSwimlane, reorderSwimlane]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
    setActionItemHoverLaneId(null);
  }, []);

  const handleSectionDrop = useCallback((e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    if (!dragId) return;
    const dragged = swimlanes.find(s => s.id === dragId);
    if (!dragged) return;
    moveToSection(dragged, sectionId);
    setDragId(null);
    setDropTarget(null);
  }, [dragId, swimlanes, moveToSection]);

  const handleSectionDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const renderRow = (lane: Swimlane, index: number, sectionLanes: Swimlane[]) => {
    const isDropAbove = dropTarget?.id === lane.id && dropTarget.position === 'above';
    const isDropBelow = dropTarget?.id === lane.id && dropTarget.position === 'below';
    const isDragging = dragId === lane.id;
    const isActionItemTarget = actionItemHoverLaneId === lane.id;

    return (
      <div
        key={lane.id}
        className={`swimlane-row${isActionItemTarget ? ' action-item-drop-target' : ''}`}
        onDragOver={e => handleDragOver(e, lane.id)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, lane, sectionLanes)}
        onDragEnd={handleDragEnd}
        onContextMenu={e => {
          e.preventDefault();
          setConfirmDelete(false);
          setSecCtxMenu(null);
          setCtxMenu({ x: e.clientX, y: e.clientY, laneId: lane.id });
        }}
        style={{
          background: index % 2 === 0 ? '#faf9f6' : '#f5f2ec',
          opacity: isDragging ? 0.4 : 1,
          borderTop: isDropAbove ? '2px solid #ad4e0a' : undefined,
          borderBottom: isDropBelow ? '2px solid #ad4e0a' : undefined,
        }}
      >
        <div
          className="swimlane-drag-handle"
          title="Drag to reorder"
          draggable
          onDragStart={e => handleDragStart(e, lane.id)}
        >
          &#x2630;
        </div>
        <div className="swimlane-project" style={{ flex: 1, position: 'relative' }}>
          <button
            className="swimlane-add-note-btn"
            onClick={e => { e.stopPropagation(); openNotesPanelForSwimlane(lane.id); }}
            title="Add action item"
          >+</button>
          <RichTextEditor
            key={lane.id}
            value={lane.projectName}
            onSave={v => updateSwimlane(lane.id, { projectName: v })}
            className="swimlane-project-editor"
          />
          {(noteCountMap.get(lane.id) || 0) > 0 && (
            <button
              className="swimlane-note-badge"
              onClick={e => { e.stopPropagation(); openNotesPanelFiltered(lane.id); }}
              title={`${noteCountMap.get(lane.id)} open action item(s) — click to view`}
            >
              {noteCountMap.get(lane.id)}
            </button>
          )}
        </div>
        <div className="swimlane-features" style={{ flex: 1 }}>
          <RichTextEditor
            key={lane.id}
            value={lane.keyFeatures}
            onSave={v => updateSwimlane(lane.id, { keyFeatures: v })}
            className="swimlane-features-editor"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="left-panel" ref={ref} onScroll={handleScroll} style={{ width }}>
      {/* Header */}
      <div className="left-panel-header">
        <div className="left-panel-header-cell" style={{ width: 20 }} />
        <div className="left-panel-header-cell" style={{ flex: 1 }}>
          Project
        </div>
        <div className="left-panel-header-cell" style={{ flex: 1 }}>
          Key Features
        </div>
      </div>
      <div className="left-panel-week-row" />

      {/* Dynamic sections */}
      {sectionedLanes.map(({ section, lanes }) => (
        <div key={section.id}>
          <div
            className="section-header"
            onDragOver={handleSectionDragOver}
            onDrop={e => handleSectionDrop(e, section.id)}
            onContextMenu={e => {
              e.preventDefault();
              setConfirmDeleteSection(false);
              setCtxMenu(null);
              setSecCtxMenu({ x: e.clientX, y: e.clientY, sectionId: section.id });
            }}
          >
            {editingSectionId === section.id ? (
              <input
                autoFocus
                defaultValue={section.label}
                style={{
                  border: 'none', background: 'transparent', textAlign: 'center',
                  fontSize: 16, fontWeight: 700, outline: '1px solid #c8c3ba',
                  borderRadius: 4, padding: '2px 8px', width: '60%',
                }}
                onBlur={e => {
                  const val = e.target.value.trim();
                  if (val) updateSection(section.id, { label: val });
                  setEditingSectionId(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingSectionId(null);
                }}
              />
            ) : (
              section.label
            )}
          </div>
          {lanes.map((lane, i) => renderRow(lane, i, lanes))}
        </div>
      ))}

      {/* Swimlane context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="context-menu"
          style={{ left: ctxPos.left, top: ctxPos.top }}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              const lane = swimlanes.find(s => s.id === ctxMenu.laneId);
              if (lane) {
                const laneBars = phaseBars.filter(b => b.swimlaneId === lane.id);
                const maxEnd = laneBars.reduce((max, b) => Math.max(max, b.startWeek + b.durationWeeks), 0);
                quickAddPhaseBar(lane.id, laneBars.length > 0 ? maxEnd + 1 : 0, 4);
              }
              setCtxMenu(null);
            }}
          >
            Add Phase Bar
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              const lane = swimlanes.find(s => s.id === ctxMenu.laneId);
              if (lane) {
                const laneBars = phaseBars.filter(b => b.swimlaneId === lane.id);
                const maxEnd = laneBars.reduce((max, b) => Math.max(max, b.startWeek + b.durationWeeks), 0);
                addMilestone(lane.id, laneBars.length > 0 ? maxEnd : 0);
              }
              setCtxMenu(null);
            }}
          >
            Add Go-Live Marker
          </div>
          <div className="context-menu-divider" />
          {sections
            .filter(sec => sec.id !== swimlanes.find(s => s.id === ctxMenu.laneId)?.section)
            .sort((a, b) => a.order - b.order)
            .map(sec => (
              <div
                key={sec.id}
                className="context-menu-item"
                onClick={() => {
                  const lane = swimlanes.find(s => s.id === ctxMenu.laneId);
                  if (lane) moveToSection(lane, sec.id);
                  setCtxMenu(null);
                }}
              >
                Move to {sec.label}
              </div>
            ))
          }
          <div className="context-menu-divider" />
          <div
            className="context-menu-item"
            style={{ color: '#b52222' }}
            onClick={() => {
              if (confirmDelete) {
                removeSwimlane(ctxMenu.laneId);
                setCtxMenu(null);
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
              }
            }}
          >
            {confirmDelete ? 'Click again to confirm' : 'Delete Swimlane'}
          </div>
        </div>
      )}

      {/* Section context menu */}
      {secCtxMenu && (
        <div
          ref={secCtxRef}
          className="context-menu"
          style={{ left: secCtxPos.left, top: secCtxPos.top }}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              addSwimlane('New Project', secCtxMenu.sectionId);
              setSecCtxMenu(null);
            }}
          >
            Add Swimlane
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              setEditingSectionId(secCtxMenu.sectionId);
              setSecCtxMenu(null);
            }}
          >
            Rename Section
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              addSection('New Section');
              setSecCtxMenu(null);
            }}
          >
            Add Section Below
          </div>
          {sections.length > 1 && (
            <>
              <div className="context-menu-divider" />
              <div
                className="context-menu-item"
                style={{ color: '#b52222' }}
                onClick={() => {
                  if (confirmDeleteSection) {
                    removeSection(secCtxMenu.sectionId);
                    setSecCtxMenu(null);
                    setConfirmDeleteSection(false);
                  } else {
                    setConfirmDeleteSection(true);
                  }
                }}
              >
                {confirmDeleteSection ? 'Click again to confirm' : 'Delete Section'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

LeftPanel.displayName = 'LeftPanel';
export default LeftPanel;
