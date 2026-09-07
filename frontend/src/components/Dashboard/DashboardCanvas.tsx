import React, { useRef, useState, useEffect, useCallback } from 'react';
import { WidgetGrid, WidgetLayout, LiveDockRect, LiveDockGesture } from '@/components/Widget/WidgetGrid';
import { GRID_ROWS } from '@/utils/dashboard-layout-engine';

interface DashboardCanvasProps {
  children: React.ReactNode;
  layouts: { lg: WidgetLayout[]; md: WidgetLayout[]; sm: WidgetLayout[] };
  staticWidgetIds?: ReadonlySet<string>;
  onLayoutChange?: (
    layout: import('react-grid-layout').Layout[],
    layouts: { [key: string]: import('react-grid-layout').Layout[] }
  ) => boolean | void;
  onLayoutSave?: (layouts: { [key: string]: import('react-grid-layout').Layout[] }) => void;
  onResize?: (
    layout: import('react-grid-layout').Layout[],
    layouts: { [key: string]: import('react-grid-layout').Layout[] },
    resizingItem: import('react-grid-layout').Layout
  ) => void;
  onResizeGestureEnd?: () => void;
  computeLiveDockRects?: (
    liveItem: import('react-grid-layout').Layout,
    allFree: import('react-grid-layout').Layout[]
  ) => Map<string, LiveDockRect>;
  computeLiveDockGesture?: (
    liveItem: import('react-grid-layout').Layout,
    allFree: import('react-grid-layout').Layout[]
  ) => LiveDockGesture;
  validateLivePlacement?: (
    liveItem: import('react-grid-layout').Layout,
    layout: import('react-grid-layout').Layout[]
  ) => boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
}

export const DashboardCanvas: React.FC<DashboardCanvasProps> = ({
  children,
  layouts,
  staticWidgetIds,
  onLayoutChange,
  onLayoutSave,
  onResize,
  onResizeGestureEnd,
  computeLiveDockRects,
  computeLiveDockGesture,
  validateLivePlacement,
  isDraggable = true,
  isResizable = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(100);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const height = el.clientHeight;
    if (height > 0) {
      const margin = 16;
      const totalMargins = margin * (GRID_ROWS - 1);
      setRowHeight(Math.max(48, Math.floor((height - totalMargins) / GRID_ROWS)));
    }
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const gridHeight = GRID_ROWS * rowHeight + (GRID_ROWS - 1) * 16;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 w-full overflow-hidden"
      style={{ minHeight: 320 }}
    >
      <div
        className="w-full overflow-hidden"
        style={{ height: gridHeight }}
      >
        <WidgetGrid
          layouts={layouts}
          staticWidgetIds={staticWidgetIds}
          onLayoutChange={onLayoutChange}
          onLayoutSave={onLayoutSave}
          onResize={onResize}
          onResizeGestureEnd={onResizeGestureEnd}
          computeLiveDockRects={computeLiveDockRects}
          computeLiveDockGesture={computeLiveDockGesture}
          validateLivePlacement={validateLivePlacement}
          isDraggable={isDraggable}
          isResizable={isResizable}
          enableAutoScroll={false}
          rowHeight={rowHeight}
          maxRows={GRID_ROWS}
        >
          {children}
        </WidgetGrid>
      </div>
    </div>
  );
};
