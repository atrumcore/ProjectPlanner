import { useRef, useCallback, useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import TimelineHeader from './TimelineHeader';
import TimelineContent from './TimelineContent';
import Toolbar from './Toolbar';
import OpenItemsPanel from './OpenItemsPanel';
import EnvironmentsPanel from './EnvironmentsPanel';
import PeoplePanel from './PeoplePanel';
import Rail from './rail/Rail';
import RailPanel from './rail/RailPanel';
import InspectorTab from './rail/InspectorTab';
import AssistantChat from './ai/AssistantChat';
import { useAssistantStore } from '../ai/useAssistantStore';
import FileUpdateBanner from './FileUpdateBanner';
import SaveConflictModal from './SaveConflictModal';
import DisplayNameModal from './DisplayNameModal';
import { wasNameAsked } from '../utils/userName';
import { useAuthStore } from '../auth/useAuthStore';
import ManagePhaseTypesModal from './ManagePhaseTypesModal';
import { useGanttStore } from '../store/useGanttStore';
import { getTodayWeekOffset } from '../utils/dateUtils';
import { buildRaidEmailHtml, buildEmlFile } from '../utils/raidEmailHtml';
import { buildSwimlaneCsv } from '../utils/swimlaneExport';
import { useThemeColors } from '../theme/ThemeContext';
import {
  ROW_HEIGHT,
  EXPORT_ROW_HEIGHT,
  WEEK_WIDTH,
} from '../types/gantt';
import { ExportLayoutContext } from './ExportLayoutContext';

const LEFT_DEFAULT = 304;
const LEFT_MIN = 80;
/** Width of the export-only Key Dependencies column (no longer resizable —
 * it never appears on screen). */
const RIGHT_DEFAULT = 180;

const RAIL_TITLES = {
  inspector: 'Inspector',
  items: 'Open Items',
  environments: 'Environments & Contention',
  people: 'People & Teams',
  assistant: 'AI Assistant',
} as const;

export default function GanttChart() {
  const themeColors = useThemeColors();
  const ganttRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const timelineBodyRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  // True only while capturing an export, so the chart renders expanded/unclipped.
  const [isExporting, setIsExporting] = useState(false);
  // Display-name prompt: once on first launch, and on demand from File menu.
  // The local display name is only needed when there's no Microsoft account to
  // attribute saves to — signed-in users are never asked.
  const signedIn = useAuthStore(s => s.account !== null);
  const [showNameModal, setShowNameModal] = useState(() => !wasNameAsked() && !useAuthStore.getState().account);

  // Resizable panel widths
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Store width before collapse so we can restore
  const leftWidthBeforeCollapse = useRef(LEFT_DEFAULT);

  // Drag-to-pan state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Resize drag state
  const resizing = useRef<'left' | null>(null);
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
  const railTab = useGanttStore(s => s.railTab);
  const setRailTab = useGanttStore(s => s.setRailTab);
  const toggleRailTab = useGanttStore(s => s.toggleRailTab);
  const openTrackedItemsFor = useGanttStore(s => s.openTrackedItemsFor);
  const assistantHasChat = useAssistantStore(s => s.messages.length > 0);
  const clearAssistantChat = useAssistantStore(s => s.clearChat);
  const environmentFocusId = useGanttStore(s => s.environmentFocusId);
  const setEnvironmentFocus = useGanttStore(s => s.setEnvironmentFocus);
  const peopleFocus = useGanttStore(s => s.peopleFocus);
  const setPeopleFocus = useGanttStore(s => s.setPeopleFocus);
  const phaseTypesModalOpen = useGanttStore(s => s.phaseTypesModalOpen);
  const trackedItems = useGanttStore(s => s.trackedItems);
  const swimlanes = useGanttStore(s => s.swimlanes);
  const sections = useGanttStore(s => s.sections);
  const phaseBars = useGanttStore(s => s.phaseBars);
  const phaseTypes = useGanttStore(s => s.phaseTypes);
  const people = useGanttStore(s => s.people);
  const teams = useGanttStore(s => s.teams);
  const currentFileName = useGanttStore(s => s.currentFileName);
  const addFloatingNote = useGanttStore(s => s.addFloatingNote);

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

  // Resize handle drag (left panel only — the dependencies column is
  // export-only and has no on-screen handle).
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = 'left';
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = leftWidth;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [leftWidth]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - resizeStartX.current;
    setLeftWidth(Math.max(LEFT_MIN, resizeStartWidth.current + dx));
    if (leftCollapsed) setLeftCollapsed(false);
  }, [leftCollapsed]);

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

  // Shared-file freshness: notice when someone else saves the open file.
  // Checked when the window regains focus (the common "switch back after a
  // teammate pinged you" moment) plus a slow poll for long-lived sessions.
  const checkFileFreshness = useGanttStore(s => s.checkFileFreshness);
  useEffect(() => {
    const onFocus = () => { void checkFileFreshness(); };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(onFocus, 10_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [checkFileFreshness]);

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
        toggleRailTab('items');
        return;
      }
      if (mod && e.shiftKey && key === 'e') {
        e.preventDefault();
        toggleRailTab('environments');
        return;
      }
      if (mod && e.shiftKey && key === 'p') {
        e.preventDefault();
        toggleRailTab('people');
        return;
      }
      if (mod && e.shiftKey && key === 'c') {
        e.preventDefault();
        toggleRailTab('assistant');
        return;
      }
      if (mod && e.shiftKey && key === 'd') {
        // Kept from when Dependencies was its own tab: opens the register
        // already filtered to that lens, so the old habit still lands.
        e.preventDefault();
        if (railTab === 'items' && useGanttStore.getState().trackedFilterKind === 'dependency') {
          setRailTab(null);
        } else {
          openTrackedItemsFor(null, 'dependency');
        }
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

      if (mod && key === 'i' && !e.shiftKey) {
        // Below the text-field guard on purpose: Ctrl+I stays italics while
        // typing in rich-text fields.
        e.preventDefault();
        toggleRailTab('inspector');
      } else if (mod && key === 'z' && e.shiftKey) {
        // Ctrl+Shift+Z = redo (must be checked before plain Ctrl+Z).
        e.preventDefault();
        redo();
      } else if (mod && key === 'z') {
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
        if (environmentFocusId) {
          setEnvironmentFocus(null);
        } else if (peopleFocus) {
          setPeopleFocus(null);
        } else if (selectedBarId) {
          selectBar(null);
        } else if (railTab) {
          setRailTab(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedBarId, removePhaseBar, selectBar, saveFile, saveFileAs, openFile, newFile, toggleRailTab, openTrackedItemsFor, railTab, setRailTab, environmentFocusId, setEnvironmentFocus, peopleFocus, setPeopleFocus]);

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

  // Capture the ENTIRE plan (not just the on-screen viewport) by temporarily
  // entering "export mode": force both side panels open, reset scroll to the
  // origin, and add `.is-exporting` to the container — which unclips overflow,
  // expands it to full content size, and renders taller rows so Key Features
  // fit (see App.css + ExportLayoutContext). Captured at full size, then the
  // live UI is restored in `finally`. Returns the canvas plus the scale used,
  // since the scale is clamped for very large plans to stay within the
  // browser's canvas size limits.
  const captureCanvas = useCallback(async (): Promise<{ canvas: HTMLCanvasElement; scale: number } | null> => {
    const el = ganttRef.current;
    if (!el) return null;
    // Blur any focused rich-text editor so the cursor/selection isn't
    // captured into the export. Also flushes any pending onBlur save.
    (document.activeElement as HTMLElement | null)?.blur();

    const body = timelineBodyRef.current;
    const prevScrollLeft = body?.scrollLeft ?? 0;
    const prevScrollTop = body?.scrollTop ?? 0;
    const prevLeftCollapsed = leftCollapsed;

    try {
      // Enter export mode (batched into one render): include the full plan by
      // forcing the collapsed left panel open, and start from the top-left
      // origin. `isExporting` also mounts the Key Dependencies column, which
      // exists only for the exported image.
      if (prevLeftCollapsed) setLeftCollapsed(false);
      setScrollLeft(0);
      if (body) { body.scrollLeft = 0; body.scrollTop = 0; }
      setIsExporting(true);

      // Wait for React to commit AND the browser to lay out the expanded DOM
      // (double rAF), plus webfonts, so scrollWidth/Height are final.
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }

      const w = Math.ceil(el.scrollWidth);
      const h = Math.ceil(el.scrollHeight);

      // Clamp scale so a large plan doesn't blow past the browser canvas limit
      // (~16384px per side and a total-area cap), which would yield a blank or
      // truncated image.
      const MAX_DIM = 16384;
      const MAX_AREA = 268_000_000;
      const RAW_SCALE = 2;
      let scale = Math.min(RAW_SCALE, MAX_DIM / Math.max(w, h));
      if (w * h * scale * scale > MAX_AREA) {
        scale = Math.min(scale, Math.sqrt(MAX_AREA / (w * h)));
      }
      if (scale < RAW_SCALE) {
        console.warn(`[export] plan is ${w}×${h}px; scaling ${RAW_SCALE}→${scale.toFixed(3)} to fit canvas limits.`);
      }

      const canvas = await html2canvas(el, {
        backgroundColor: themeColors.BG_APP,
        scale,
        width: w,
        height: h,
        windowWidth: w,
        windowHeight: h,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });
      return { canvas, scale };
    } finally {
      // Restore the live UI even if capture throws. Dropping `.is-exporting`
      // reverts every CSS override at once.
      setIsExporting(false);
      if (prevLeftCollapsed) setLeftCollapsed(true);
      if (body) { body.scrollLeft = prevScrollLeft; body.scrollTop = prevScrollTop; }
      setScrollLeft(prevScrollLeft);
    }
  }, [themeColors, leftCollapsed]);

  // Base name for exported files: the open document's name (sans .json), else
  // a sensible default. Keeps downloads identifiable instead of a generic name.
  const exportBaseName = useCallback(() => {
    const raw = currentFileName?.replace(/\.json$/i, '').trim();
    return raw && raw.length > 0 ? raw : 'Project Roadmap';
  }, [currentFileName]);

  const exportPNG = useCallback(async () => {
    try {
      const result = await captureCanvas();
      if (!result) return;
      const link = document.createElement('a');
      link.download = `${exportBaseName()}.png`;
      link.href = result.canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
      alert(`PNG export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [captureCanvas, exportBaseName]);

  const exportPDF = useCallback(async () => {
    try {
      const result = await captureCanvas();
      if (!result) return;
      const { canvas, scale } = result;
      // Chart image size in points (dividing by the capture scale brings the
      // hi-DPI canvas back to roughly screen size).
      const imgW = canvas.width / scale;
      const imgH = canvas.height / scale;

      // Frame the chart on a content-sized page: a margin all round plus a
      // title band up top with the plan name and generation date. This turns
      // the export from a bare edge-to-edge raster into a titled document.
      const margin = 28;
      const titleBand = 52;
      const pageW = imgW + margin * 2;
      const pageH = imgH + margin * 2 + titleBand;

      const pdf = new jsPDF({
        orientation: pageW >= pageH ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pageW, pageH],
        compress: true,
      });

      const title = exportBaseName();
      const generated = new Date().toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(20, 20, 20);
      pdf.text(title, margin, margin + 20);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Generated ${generated}`, margin, margin + 38);

      pdf.addImage(
        canvas.toDataURL('image/png'), 'PNG',
        margin, margin + titleBand, imgW, imgH, undefined, 'FAST',
      );
      pdf.save(`${title}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert(`PDF export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [captureCanvas, exportBaseName]);

  const emailNotes = useCallback(() => {
    // A .eml rather than a mailto: link. mailto has no way to declare a
    // content type, so every client renders the body as plain text, and its
    // URL length cap silently truncated long logs. The file IS the message —
    // HTML intact, no size limit — and X-Unsent makes Outlook open it as a
    // draft you address and send.
    const mail = buildRaidEmailHtml(swimlanes, trackedItems, currentFileName);
    const url = URL.createObjectURL(buildEmlFile(mail));
    const link = document.createElement('a');
    link.download = `${mail.subject}.eml`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [swimlanes, trackedItems, currentFileName]);

  const exportSwimlanes = useCallback(() => {
    const csv = buildSwimlaneCsv(swimlanes, sections, phaseBars, phaseTypes, timeline, people, teams);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${exportBaseName()} - swimlanes.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [swimlanes, sections, phaseBars, phaseTypes, timeline, people, teams, exportBaseName]);

  const scrollToToday = useCallback(() => {
    if (!timelineBodyRef.current) return;
    const todayOffset = getTodayWeekOffset(timeline.startMonth, timeline.startYear);
    const todayX = todayOffset * timeline.weekWidthPx;
    const containerWidth = timelineBodyRef.current.clientWidth;
    timelineBodyRef.current.scrollLeft = todayX - containerWidth / 2;
  }, [timeline.startMonth, timeline.startYear, timeline.weekWidthPx]);

  // Right-click on empty canvas: bars/milestones stop propagation for their
  // own menus, so this only fires on the background.
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCanvasCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const addNoteAtCanvasPoint = useCallback(() => {
    if (!canvasCtxMenu) return;
    const el = timelineBodyRef.current;
    if (!el) { addFloatingNote(40, 40); setCanvasCtxMenu(null); return; }
    const rect = el.getBoundingClientRect();
    addFloatingNote(
      el.scrollLeft + canvasCtxMenu.x - rect.left,
      el.scrollTop + canvasCtxMenu.y - rect.top,
    );
    setCanvasCtxMenu(null);
  }, [canvasCtxMenu, addFloatingNote]);


  return (
    <ExportLayoutContext.Provider value={{ rowHeight: isExporting ? EXPORT_ROW_HEIGHT : ROW_HEIGHT, isExporting }}>
    <Toolbar onScrollToToday={scrollToToday} onExportPNG={exportPNG} onExportPDF={exportPDF} onExportSwimlanes={exportSwimlanes} onEmailNotes={emailNotes} onSetDisplayName={() => setShowNameModal(true)} />
    <FileUpdateBanner />
    <div className="app-main-row">
    <div className={`gantt-container${isExporting ? ' is-exporting' : ''}`} ref={ganttRef}>
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
        onPointerDown={handleResizeStart}
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

      {/* Timeline center. Overflow lives in CSS (.timeline-center) so export
          mode can override it. */}
      <div className="timeline-center" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 200, position: 'relative' }}>
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
          onContextMenu={handleCanvasContextMenu}
          style={{ flex: 1 }}
        >
          <TimelineContent />
        </div>
        {/* Floating zoom cluster — hidden while exporting (App.css). The
            middle button shows the LIVE zoom level and resets it. */}
        <div className="zoom-cluster">
          <button onClick={zoomOut} title="Zoom out (Ctrl+Scroll)">&minus;</button>
          <button onClick={zoomReset} title="Reset zoom to 100%">
            {Math.round((timeline.weekWidthPx / WEEK_WIDTH) * 100)}%
          </button>
          <button onClick={zoomIn} title="Zoom in (Ctrl+Scroll)">+</button>
        </div>
      </div>

      {/* Key Dependencies column \u2014 EXPORT ONLY. Reading and editing happen in
          the rail tab (Ctrl+Shift+D); the column exists purely so exported
          PNG/PDF plans still carry each project's dependencies for readers
          who only ever see the picture. */}
      {isExporting && <RightPanel ref={rightRef} onScroll={() => {}} width={RIGHT_DEFAULT} />}
    </div>

    {/* Rail panel + strip — in-flow, outside .gantt-container so exports
        never capture them. One panel at a time; a single RailPanel instance
        hosts every tab so the chosen width survives tab switches. */}
    {railTab && (
      <RailPanel
        title={RAIL_TITLES[railTab]}
        onClose={() => setRailTab(null)}
        headerActions={railTab === 'items'
          ? <button onClick={emailNotes} title="Email notes" aria-label="Email notes">&#x2709;</button>
          : railTab === 'assistant' && assistantHasChat
            ? <button className="assistant-clear-btn" onClick={clearAssistantChat} title="Clear conversation">Clear</button>
            : undefined}
      >
        {railTab === 'inspector' && <InspectorTab />}
        {railTab === 'items' && <OpenItemsPanel />}
        {railTab === 'environments' && <EnvironmentsPanel />}
        {railTab === 'people' && <PeoplePanel />}
        {railTab === 'assistant' && <AssistantChat />}
      </RailPanel>
    )}
    <Rail />
    </div>
    {canvasCtxMenu && (
      <>
        <div className="canvas-ctx-scrim" onClick={() => setCanvasCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCanvasCtxMenu(null); }} />
        <div className="context-menu" style={{ left: canvasCtxMenu.x, top: canvasCtxMenu.y, position: 'fixed' }}>
          <div className="context-menu-item" onClick={addNoteAtCanvasPoint}>Add note here</div>
          <div className="context-menu-item" onClick={() => { scrollToToday(); setCanvasCtxMenu(null); }}>Scroll to today</div>
        </div>
      </>
    )}
    {phaseTypesModalOpen && <ManagePhaseTypesModal />}
    <SaveConflictModal />
    {showNameModal && !signedIn && <DisplayNameModal onClose={() => setShowNameModal(false)} />}
    </ExportLayoutContext.Provider>
  );
}
