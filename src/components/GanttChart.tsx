import { useRef, useCallback, useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import TimelineHeader from './TimelineHeader';
import TimelineContent from './TimelineContent';
import Toolbar from './Toolbar';
import NotesPanel from './NotesPanel';
import { useGanttStore } from '../store/useGanttStore';
import { getTodayWeekOffset } from '../utils/dateUtils';
import { buildNotesEmail } from '../utils/notesEmail';

const LEFT_DEFAULT = 304;
const LEFT_MIN = 80;
const RIGHT_DEFAULT = 180;
const RIGHT_MIN = 60;

export default function GanttChart() {
  const ganttRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const timelineBodyRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Resizable panel widths
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Store width before collapse so we can restore
  const leftWidthBeforeCollapse = useRef(LEFT_DEFAULT);
  const rightWidthBeforeCollapse = useRef(RIGHT_DEFAULT);

  // Drag-to-pan state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Resize drag state
  const resizing = useRef<'left' | 'right' | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const timeline = useGanttStore(s => s.timeline);
  const undo = useGanttStore(s => s.undo);
  const redo = useGanttStore(s => s.redo);
  const selectedBarId = useGanttStore(s => s.selectedBarId);
  const removePhaseBar = useGanttStore(s => s.removePhaseBar);
  const selectBar = useGanttStore(s => s.selectBar);
  const zoomIn = useGanttStore(s => s.zoomIn);
  const zoomOut = useGanttStore(s => s.zoomOut);
  const zoomReset = useGanttStore(s => s.zoomReset);
  const setSpaceHeld = useGanttStore(s => s.setSpaceHeld);
  const saveFile = useGanttStore(s => s.saveFile);
  const saveFileAs = useGanttStore(s => s.saveFileAs);
  const openFile = useGanttStore(s => s.openFile);
  const newFile = useGanttStore(s => s.newFile);
  const notesPanelOpen = useGanttStore(s => s.notesPanelOpen);
  const toggleNotesPanel = useGanttStore(s => s.toggleNotesPanel);
  const actionItems = useGanttStore(s => s.actionItems);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const currentFileName = useGanttStore(s => s.currentFileName);

  // Panel collapse toggles
  const toggleLeftCollapse = useCallback(() => {
    if (leftCollapsed) {
      setLeftWidth(leftWidthBeforeCollapse.current);
      setLeftCollapsed(false);
    } else {
      leftWidthBeforeCollapse.current = leftWidth;
      setLeftCollapsed(true);
    }
  }, [leftCollapsed, leftWidth]);

  const toggleRightCollapse = useCallback(() => {
    if (rightCollapsed) {
      setRightWidth(rightWidthBeforeCollapse.current);
      setRightCollapsed(false);
    } else {
      rightWidthBeforeCollapse.current = rightWidth;
      setRightCollapsed(true);
    }
  }, [rightCollapsed, rightWidth]);

  // Resize handle drag
  const handleResizeStart = useCallback((side: 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = side;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = side === 'left' ? leftWidth : rightWidth;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [leftWidth, rightWidth]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - resizeStartX.current;
    if (resizing.current === 'left') {
      setLeftWidth(Math.max(LEFT_MIN, resizeStartWidth.current + dx));
      if (leftCollapsed) setLeftCollapsed(false);
    } else {
      // Right panel: dragging left makes it bigger
      setRightWidth(Math.max(RIGHT_MIN, resizeStartWidth.current - dx));
      if (rightCollapsed) setRightCollapsed(false);
    }
  }, [leftCollapsed, rightCollapsed]);

  const handleResizeEnd = useCallback(() => {
    resizing.current = null;
  }, []);

  // Sync vertical scroll across all three panels
  const syncScroll = useCallback((source: 'left' | 'right' | 'timeline', scrollTop: number) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (source !== 'left' && leftRef.current) leftRef.current.scrollTop = scrollTop;
    if (source !== 'right' && rightRef.current) rightRef.current.scrollTop = scrollTop;
    if (source !== 'timeline' && timelineBodyRef.current) timelineBodyRef.current.scrollTop = scrollTop;
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (timelineBodyRef.current) {
      syncScroll('timeline', timelineBodyRef.current.scrollTop);
      setScrollLeft(timelineBodyRef.current.scrollLeft);
    }
  }, [syncScroll]);

  // Drag-to-pan
  const handlePanStart = useCallback((e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      const el = timelineBodyRef.current!;
      panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      el.style.cursor = 'grabbing';
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePanMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const el = timelineBodyRef.current!;
    el.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.x);
    el.scrollTop = panStart.current.scrollTop - (e.clientY - panStart.current.y);
  }, []);

  const handlePanEnd = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      if (timelineBodyRef.current) timelineBodyRef.current.style.cursor = '';
    }
  }, []);

  // Ctrl+Scroll zoom
  useEffect(() => {
    const el = timelineBodyRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoomIn, zoomOut]);

  // Load from localStorage on mount
  const loadFromStorage = useGanttStore(s => s.loadFromStorage);
  useEffect(() => { loadFromStorage(); }, [loadFromStorage]);

  // Space+drag pan
  const spaceHeld = useRef(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceHeld.current && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        spaceHeld.current = true;
        setSpaceHeld(true);
        if (timelineBodyRef.current) timelineBodyRef.current.style.cursor = 'grab';
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false;
        setSpaceHeld(false);
        if (timelineBodyRef.current && !isPanning.current) timelineBodyRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // File shortcuts fire regardless of focus — Ctrl+S should work even
      // while typing in a field. saveFile/openFile/newFile blur the
      // active element internally so any pending contentEditable commits
      // before we serialize state.
      if (mod && key === 's') {
        e.preventDefault();
        if (e.shiftKey) saveFileAs();
        else saveFile();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        openFile();
        return;
      }
      if (mod && e.shiftKey && key === 'n') {
        e.preventDefault();
        toggleNotesPanel();
        return;
      }
      if (mod && key === 'n') {
        // Browsers typically intercept Ctrl+N before JS sees it, so this
        // may not fire — the toolbar button is the reliable path.
        e.preventDefault();
        newFile();
        return;
      }

      const inTextField =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target.isContentEditable;
      if (inTextField) return;

      if (mod && key === 'z') {
        e.preventDefault();
        undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBarId) {
          e.preventDefault();
          removePhaseBar(selectedBarId);
        }
      } else if (e.key === 'Escape') {
        selectBar(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedBarId, removePhaseBar, selectBar, saveFile, saveFileAs, openFile, newFile, toggleNotesPanel]);

  const handleSpacePanStart = useCallback((e: React.PointerEvent) => {
    if (spaceHeld.current && e.button === 0) {
      e.preventDefault();
      isPanning.current = true;
      const el = timelineBodyRef.current!;
      panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      el.style.cursor = 'grabbing';
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  }, []);

  const combinedPointerDown = useCallback((e: React.PointerEvent) => {
    handlePanStart(e);
    handleSpacePanStart(e);
  }, [handlePanStart, handleSpacePanStart]);

  const exportPNG = useCallback(async () => {
    if (!ganttRef.current) return;
    try {
      // Blur any focused rich-text editor so the cursor/selection isn't
      // captured into the PNG. Also flushes any pending onBlur save.
      (document.activeElement as HTMLElement | null)?.blur();
      const canvas = await html2canvas(ganttRef.current, {
        backgroundColor: '#e8e4dd',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = 'dha-gantt-chart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    }
  }, []);

  const emailNotes = useCallback(() => {
    const { subject, body } = buildNotesEmail(swimlanes, sections, actionItems, currentFileName);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [swimlanes, sections, actionItems, currentFileName]);

  const scrollToToday = useCallback(() => {
    if (!timelineBodyRef.current) return;
    const todayOffset = getTodayWeekOffset(timeline.startMonth, timeline.startYear);
    const todayX = todayOffset * timeline.weekWidthPx;
    const containerWidth = timelineBodyRef.current.clientWidth;
    timelineBodyRef.current.scrollLeft = todayX - containerWidth / 2;
  }, [timeline.startMonth, timeline.startYear, timeline.weekWidthPx]);


  return (
    <>
    <Toolbar onScrollToToday={scrollToToday} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset} onExportPNG={exportPNG} onEmailNotes={emailNotes} />
    <div className="gantt-container" ref={ganttRef}>
      {/* Left panel */}
      {!leftCollapsed && (
        <LeftPanel
          ref={leftRef}
          onScroll={top => syncScroll('left', top)}
          width={leftWidth}
        />
      )}

      {/* Left resize handle + collapse toggle */}
      <div
        className="resize-handle"
        onPointerDown={e => handleResizeStart('left', e)}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      >
        <button
          className="collapse-btn collapse-btn-left"
          onClick={toggleLeftCollapse}
          title={leftCollapsed ? 'Show left panel' : 'Hide left panel'}
        >
          {leftCollapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>

      {/* Timeline center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 200 }}>
        <TimelineHeader
          totalWeeks={timeline.totalWeeks}
          startMonth={timeline.startMonth}
          startYear={timeline.startYear}
          scrollLeft={scrollLeft}
        />
        <div
          className="timeline-wrapper"
          ref={timelineBodyRef}
          onScroll={handleTimelineScroll}
          onPointerDown={combinedPointerDown}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
          style={{ flex: 1 }}
        >
          <TimelineContent />
        </div>
      </div>

      {/* Right resize handle + collapse toggle */}
      <div
        className="resize-handle"
        onPointerDown={e => handleResizeStart('right', e)}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      >
        <button
          className="collapse-btn collapse-btn-right"
          onClick={toggleRightCollapse}
          title={rightCollapsed ? 'Show right panel' : 'Hide right panel'}
        >
          {rightCollapsed ? '\u25C0' : '\u25B6'}
        </button>
      </div>

      {/* Right panel */}
      {!rightCollapsed && (
        <RightPanel
          ref={rightRef}
          onScroll={top => syncScroll('right', top)}
          width={rightWidth}
        />
      )}
    </div>
    {notesPanelOpen && <NotesPanel />}
    </>
  );
}
