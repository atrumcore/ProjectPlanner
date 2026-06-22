import { createContext, useContext } from 'react';
import { ROW_HEIGHT } from '../types/gantt';

/**
 * Layout values that change while the chart is being rendered for export.
 *
 * During export the rows are made taller so Key Features lists fit. The
 * timeline is an SVG that bakes the row height into every Y coordinate, so it
 * can't read the CSS `--row-height` variable — it reads `rowHeight` from this
 * context instead. `GanttChart` provides the export height while the DOM
 * panels pick up the matching `--row-height` override from CSS, keeping the
 * SVG bars aligned with the panel rows.
 */
export interface ExportLayout {
  /** Row height the timeline SVG should draw with (ROW_HEIGHT normally). */
  rowHeight: number;
  /** True only during an export capture. */
  isExporting: boolean;
}

export const ExportLayoutContext = createContext<ExportLayout>({
  rowHeight: ROW_HEIGHT,
  isExporting: false,
});

export function useExportLayout(): ExportLayout {
  return useContext(ExportLayoutContext);
}
