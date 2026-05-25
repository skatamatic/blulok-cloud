// src/components/Widget/WidgetGrid.tsx

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

/** Rect emitted by the parent for a single dock during a live drag/resize. */
export interface LiveDockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Combined live-gesture preview: dock rects + placement validity. */
export interface LiveDockGesture {
  rects: Map<string, LiveDockRect>;
  accepted: boolean;
}

function liveGridGestureSig(item: Pick<Layout, 'x' | 'y' | 'w' | 'h'>): string {
  return `${item.x},${item.y},${item.w}x${item.h}`;
}

function dockRectsSig(rects: Map<string, LiveDockRect>): string {
  return [...rects.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, r]) => `${id}@${r.x},${r.y},${r.w}x${r.h}`)
    .join('|');
}

interface WidgetGridProps {
  children: React.ReactNode;
  layouts: { [key: string]: WidgetLayout[] };
  /**
   * Called when RGL wants to commit a drag/resize. If the callback returns
   * `false` the change is rejected and the grid snaps back to its prior state
   * (we remount RGL so its internal layout is re-initialised from props).
   * `undefined` / `true` mean accepted (the existing onLayoutChange contract).
   */
  onLayoutChange?: (
    layout: Layout[],
    layouts: { [key: string]: Layout[] }
  ) => boolean | void;
  onLayoutSave?: (layouts: { [key: string]: Layout[] }) => void;
  /** Fires during resize (RGL skips onLayoutChange while the placeholder is active). */
  onResize?: (
    layout: Layout[],
    layouts: { [key: string]: Layout[] },
    resizingItem: Layout
  ) => void;
  /** Clears any live resize preview when a resize gesture ends. */
  onResizeGestureEnd?: () => void;
  /**
   * Called continuously during a drag/resize with the gesture's live grid
   * position. Returns the rect each dock should display at right now, keyed by
   * widget id. WidgetGrid applies these as DOM-level transforms to the dock
   * elements so they appear to shrink in real time without us having to update
   * RGL's internal layout (which is locked while `activeDrag` is set).
   */
  computeLiveDockRects?: (
    liveItem: Layout,
    allFree: Layout[]
  ) => Map<string, LiveDockRect>;
  /**
   * Preferred live-gesture hook: one dock reflow per tick (rects + validity).
   * When provided, `computeLiveDockRects` / `validateLivePlacement` are ignored.
   */
  computeLiveDockGesture?: (
    liveItem: Layout,
    allFree: Layout[]
  ) => LiveDockGesture;
  /** Returns false when the live drag/resize position would be rejected on drop. */
  validateLivePlacement?: (liveItem: Layout, layout: Layout[]) => boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  className?: string;
  enableAutoScroll?: boolean;
  rowHeight?: number;
  maxRows?: number;
  /** Widget IDs pinned in place (dock layouts). */
  staticWidgetIds?: ReadonlySet<string>;
  /** @deprecated Dashboard state uses blulok-dashboard-v2 via useDashboardState */
  persistToLocalStorage?: boolean;
}

/**
 * Thin wrapper around react-grid-layout that:
 *  - lets the parent (`useDashboardState`) own all layout reflow logic, and
 *  - configures RGL so it never moves siblings on its own during a drag.
 *
 * Why `allowOverlap: true` + `compactType: null`:
 *   With any other RGL collision config, dragging a widget toward a docked
 *   (static) widget triggers RGL's `moveElementAwayFromCollision` which either
 *   (a) corrupts sibling positions via a buggy `compactType: null` branch, or
 *   (b) refuses to place the dragged item inside the dock's rect (blocking
 *   the "drag into dock space, dock shrinks" UX). `allowOverlap` short-circuits
 *   that path entirely: while a drag is active the dragged item moves freely
 *   and every other item stays put. On `onDragStop` / `onResizeStop` we hand
 *   the resulting layout to `layoutWithFlexibleDocks` (in the parent), which
 *   shrinks docks around the new widget position and nudges anything that
 *   ended up overlapping. Mid-gesture `onLayoutChange` events are ignored so
 *   the engine only runs once per gesture.
 */
export const WidgetGrid: React.FC<WidgetGridProps> = ({
  children,
  layouts,
  onLayoutChange,
  onLayoutSave,
  onResize,
  onResizeGestureEnd,
  computeLiveDockRects,
  computeLiveDockGesture,
  validateLivePlacement,
  isDraggable = true,
  isResizable = true,
  className = '',
  enableAutoScroll = false,
  rowHeight = 120,
  maxRows,
  staticWidgetIds,
  persistToLocalStorage = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [placementInvalid, setPlacementInvalid] = useState(false);
  /** Brief rejected-layout override to resync RGL without remounting all widgets. */
  const [layoutResyncOverride, setLayoutResyncOverride] = useState<{
    [key: string]: Layout[];
  } | null>(null);
  const layoutResyncRafRef = useRef<number | null>(null);
  const preGestureLayoutRef = useRef<Layout[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Inline styles we applied to dock elements during a live drag, so we can
  // clear them on drag stop and let RGL render its own transforms again.
  const liveDockTouchedRef = useRef<Set<string>>(new Set());
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollDelayRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const prevLayoutSigRef = useRef<string | null>(null);
  const ignoreLayoutEchoUntilRef = useRef(0);
  // RGL emits many onLayoutChange events during a drag/resize; we only want to
  // run the reflow engine once when the gesture ends.
  const isInteractingRef = useRef(false);

  const layoutSig = useMemo(
    () =>
      (layouts.lg ?? [])
        .map((i) => `${i.i}@${i.x},${i.y},${i.w}x${i.h}`)
        .join('|'),
    [layouts.lg]
  );

  useEffect(() => {
    if (prevLayoutSigRef.current !== null && prevLayoutSigRef.current !== layoutSig) {
      ignoreLayoutEchoUntilRef.current = Date.now() + 150;
      isInitialLoadRef.current = true;
    }
    prevLayoutSigRef.current = layoutSig;
  }, [layoutSig]);

  const shouldIgnoreLayoutEvent = useCallback(() => {
    if (Date.now() < ignoreLayoutEchoUntilRef.current) return true;
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return true;
    }
    return false;
  }, []);

  const saveToWindowStorage = useCallback(
    (allLayouts: { [key: string]: Layout[] }) => {
      if (!persistToLocalStorage) return;
      try {
        window.localStorage.setItem(
          'blulok-widget-layouts',
          JSON.stringify(allLayouts)
        );
      } catch (error) {
        console.warn('Failed to save layouts to window storage:', error);
      }
    },
    [persistToLocalStorage]
  );

  // Tweaked to require substantially smaller window before switching layouts.
  // Aligns roughly with Tailwind: lg 1024, md 768, sm 640.
  const breakpoints = { lg: 1024, md: 768, sm: 640, xs: 480, xxs: 0 };
  const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

  // Mark dock widgets as `static` so RGL won't pick them up for drag/resize.
  // We do NOT freeze the rest — with `allowOverlap: true` RGL leaves siblings
  // alone during a drag anyway, so freezing would only get in the way of e.g.
  // resizing a free widget while another is mid-drag (not actually possible,
  // but the cleaner model is to let static reflect the persistent dock state).
  const layoutsWithStatic = useMemo(() => {
    const source = layoutResyncOverride ?? layouts;
    const pin = (items: WidgetLayout[]) =>
      items.map((item) => ({
        ...item,
        static: staticWidgetIds?.has(item.i) ?? false,
      }));
    const lg = pin((source.lg ?? []) as WidgetLayout[]);
    return {
      lg,
      md: pin((source.md ?? lg) as WidgetLayout[]),
      sm: pin((source.sm ?? lg) as WidgetLayout[]),
    };
  }, [layouts, layoutResyncOverride, staticWidgetIds]);

  const cancelLayoutResync = useCallback(() => {
    if (layoutResyncRafRef.current != null) {
      cancelAnimationFrame(layoutResyncRafRef.current);
      layoutResyncRafRef.current = null;
    }
    setLayoutResyncOverride(null);
  }, []);

  /**
   * RGL keeps the rejected layout in internal state after drag/resize stop.
   * Remounting the whole grid to fix that re-initialises every widget. Instead,
   * briefly pass the rejected layout through props (step 1) then restore the
   * committed layouts from the parent (step 2) so Responsive + RGL resync.
   */
  const resyncGridLayoutAfterReject = useCallback(
    (rejectedLayout: Layout[]) => {
      cancelLayoutResync();
      const rejected = {
        lg: rejectedLayout,
        md: rejectedLayout,
        sm: rejectedLayout,
      };
      setLayoutResyncOverride(rejected);
      layoutResyncRafRef.current = requestAnimationFrame(() => {
        layoutResyncRafRef.current = null;
        setLayoutResyncOverride(null);
      });
      ignoreLayoutEchoUntilRef.current = Date.now() + 400;
      isInitialLoadRef.current = true;
    },
    [cancelLayoutResync]
  );

  const snapshotPreGestureLayout = useCallback(() => {
    preGestureLayoutRef.current = (layouts.lg ?? []).map((item) => ({ ...item }));
  }, [layouts.lg]);

  const commitLayout = useCallback(
    (layout: Layout[]) => {
      const merged: { [key: string]: Layout[] } = {
        ...layouts,
        lg: layout,
      };
      const result = onLayoutChange?.(layout, merged);
      if (result === false) {
        resyncGridLayoutAfterReject(layout);
        return;
      }
      saveToWindowStorage(merged);
      if (onLayoutSave && !isInitialLoadRef.current) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => onLayoutSave(merged), 500);
      }
      // Suppress the echo onLayoutChange RGL fires right after the gesture.
      ignoreLayoutEchoUntilRef.current = Date.now() + 250;
    },
    [layouts, onLayoutChange, onLayoutSave, saveToWindowStorage, resyncGridLayoutAfterReject]
  );

  // ---------- Live dock shrink during drag/resize ----------------------------
  // RGL's `getDerivedStateFromProps` returns null while a drag is active so we
  // can't push updated dock geometry through the layouts prop. Instead we
  // store the live rects in a ref and apply them as inline transform / width /
  // height styles on the dock DOM elements. RGL re-renders all grid items on
  // every internal setState (each drag tick) which wipes our inline styles, so
  // we re-apply in a useLayoutEffect that runs after every commit while the
  // gesture is active. Each dock-side child is identified by a
  // `data-widget-id` attribute the parent puts on the grid-item wrapper.

  // Bumped on every onDrag/onResize so the useLayoutEffect re-runs and
  // re-applies the latest rects. Doubling as the trigger for clearing
  // overrides on drag stop.
  const [liveTick, setLiveTick] = useState(0);
  const liveDockRectsRef = useRef<Map<string, LiveDockRect>>(new Map());
  const lastLiveGridSigRef = useRef<string | null>(null);
  const lastDockRectsSigRef = useRef<string | null>(null);
  const lastPlacementValidRef = useRef(true);
  const dockDomCacheRef = useRef<Map<string, HTMLElement>>(new Map());
  const pendingGestureRef = useRef<{ liveItem: Layout; layout: Layout[] } | null>(
    null
  );
  const gestureRafRef = useRef<number | null>(null);

  const buildDockDomCache = useCallback(() => {
    const container = containerRef.current;
    const cache = new Map<string, HTMLElement>();
    if (!container || !staticWidgetIds) {
      dockDomCacheRef.current = cache;
      return;
    }
    for (const id of staticWidgetIds) {
      const el = container.querySelector<HTMLElement>(
        `[data-widget-id="${CSS.escape(id)}"]`
      );
      if (el) {
        cache.set(id, el.closest<HTMLElement>('.react-grid-item') ?? el);
      }
    }
    dockDomCacheRef.current = cache;
  }, [staticWidgetIds]);

  const applyLiveDockRects = useCallback(() => {
    const rects = liveDockRectsRef.current;
    if (rects.size === 0) return;
    const container = containerRef.current;
    const containerWidth = container?.clientWidth ?? 0;
    const verticalMargin = 16;
    const horizontalMargin = 16;
    const colWidth =
      containerWidth > 0 ? (containerWidth - horizontalMargin * 11) / 12 : 0;
    for (const [id, rect] of rects) {
      let target = dockDomCacheRef.current.get(id);
      if (!target && container) {
        const el = container.querySelector<HTMLElement>(
          `[data-widget-id="${CSS.escape(id)}"]`
        );
        if (el) {
          target = el.closest<HTMLElement>('.react-grid-item') ?? el;
          dockDomCacheRef.current.set(id, target);
        }
      }
      if (!target || colWidth <= 0) continue;
      const left = Math.round(rect.x * (colWidth + horizontalMargin));
      const top = Math.round(rect.y * (rowHeight + verticalMargin));
      const widthPx = Math.round(
        rect.w * colWidth + Math.max(0, rect.w - 1) * horizontalMargin
      );
      const heightPx = Math.round(
        rect.h * rowHeight + Math.max(0, rect.h - 1) * verticalMargin
      );
      target.style.transform = `translate(${left}px, ${top}px)`;
      target.style.width = `${widthPx}px`;
      target.style.height = `${heightPx}px`;
      liveDockTouchedRef.current.add(id);
    }
  }, [rowHeight]);

  const clearLiveDockOverrides = useCallback(() => {
    // CRITICAL: do NOT removeProperty here. RGL renders its grid items via
    // inline `style={{ transform, width, height }}` and React's style differ
    // skips re-setting any property whose vdom value didn't change since the
    // previous render. We mutated those properties out of band (our live
    // shrink), so React's tracked-previous value is stale. If we strip the
    // inline styles here, the next RGL re-render commonly diffs to "same as
    // before" → no DOM update → the element is left with NO transform/width/
    // height → it collapses to top:0,left:0 with auto sizing (which looks like
    // a left-anchored dock pasted on top of other widgets).
    //
    // Instead, leave whatever value the last drag tick wrote on the element.
    // It already matches the rect the engine will produce on commit (same
    // inputs), so DOM and React-state stay consistent. Anything that does
    // change post-commit (e.g. validation reject → remount, or the engine
    // settling on a different rect) will surface as a vdom diff and React
    // will overwrite our value. Just drop our bookkeeping refs.
    liveDockRectsRef.current = new Map();
    liveDockTouchedRef.current.clear();
  }, []);

  const processLiveDockUpdate = useCallback(
    (liveItem: Layout, layout: Layout[]) => {
      const gridSig = liveGridGestureSig(liveItem);
      const gridChanged = gridSig !== lastLiveGridSigRef.current;

      if (gridChanged) {
        lastLiveGridSigRef.current = gridSig;

        const free = layout.filter(
          (item) => !(staticWidgetIds?.has(item.i) ?? false)
        );

        let rects: Map<string, LiveDockRect>;
        let accepted = true;

        if (computeLiveDockGesture) {
          const gesture = computeLiveDockGesture(liveItem, free);
          rects = gesture.rects;
          accepted = gesture.accepted;
        } else {
          if (validateLivePlacement) {
            accepted = validateLivePlacement(liveItem, layout);
          }
          if (!computeLiveDockRects) {
            if (
              validateLivePlacement &&
              accepted !== lastPlacementValidRef.current
            ) {
              lastPlacementValidRef.current = accepted;
              setPlacementInvalid(!accepted);
            }
            return;
          }
          rects = computeLiveDockRects(liveItem, free);
        }

        if (accepted !== lastPlacementValidRef.current) {
          lastPlacementValidRef.current = accepted;
          setPlacementInvalid(!accepted);
        }

        const nextRectsSig = dockRectsSig(rects);
        if (nextRectsSig !== lastDockRectsSigRef.current) {
          lastDockRectsSigRef.current = nextRectsSig;
          liveDockRectsRef.current = rects;
        }
      } else if (liveDockRectsRef.current.size === 0) {
        return;
      }

      // Only re-apply dock DOM overrides when docks are present.
      if (liveDockRectsRef.current.size > 0) {
        setLiveTick((t) => t + 1);
      }
    },
    [
      computeLiveDockGesture,
      computeLiveDockRects,
      staticWidgetIds,
      validateLivePlacement,
    ]
  );

  const cancelPendingGestureFrame = useCallback(() => {
    if (gestureRafRef.current != null) {
      cancelAnimationFrame(gestureRafRef.current);
      gestureRafRef.current = null;
    }
    pendingGestureRef.current = null;
  }, []);

  const runLiveDockUpdate = useCallback(
    (liveItem: Layout, layout: Layout[]) => {
      if (!computeLiveDockGesture && !computeLiveDockRects && !validateLivePlacement) {
        return;
      }
      pendingGestureRef.current = { liveItem, layout };
      if (gestureRafRef.current != null) return;
      gestureRafRef.current = requestAnimationFrame(() => {
        gestureRafRef.current = null;
        const pending = pendingGestureRef.current;
        pendingGestureRef.current = null;
        if (!pending) return;
        processLiveDockUpdate(pending.liveItem, pending.layout);
      });
    },
    [computeLiveDockGesture, computeLiveDockRects, validateLivePlacement, processLiveDockUpdate]
  );

  const resetLiveGestureTracking = useCallback(() => {
    cancelPendingGestureFrame();
    lastLiveGridSigRef.current = null;
    lastDockRectsSigRef.current = null;
    lastPlacementValidRef.current = true;
    dockDomCacheRef.current.clear();
  }, [cancelPendingGestureFrame]);

  // Re-apply inline dock overrides after every commit while the gesture is
  // active. RGL's own setState during a drag tick re-renders all grid items
  // (each GridItem gets a fresh style object), which would wipe our overrides
  // if we only applied them inside onDrag.
  useLayoutEffect(() => {
    applyLiveDockRects();
  }, [liveTick, applyLiveDockRects]);

  // RGL only sets `style.height` on its container when `autoSize: true`. With
  // autoSize off and absolutely positioned children the container collapses to
  // 0px, which makes GridItem's drag handler (`offsetParent.clientHeight - h`)
  // produce a NEGATIVE bottom boundary — `top` clamps to 0 and vertical drag
  // dies. We force an explicit pixel height covering every row of the bounded
  // grid so vertical drag has its full range.
  const gridStyle = useMemo(() => {
    if (maxRows == null) return undefined;
    const verticalMargin = 16;
    return { height: maxRows * rowHeight + (maxRows - 1) * verticalMargin };
  }, [maxRows, rowHeight]);

  const gridProps = useMemo(() => ({
    className: `widget-grid ${isDraggable ? 'widget-grid--layout-editable' : 'widget-grid--layout-locked'} ${
      placementInvalid ? 'widget-grid--placement-invalid' : ''
    } ${className}`.trim(),
    style: gridStyle,
    layouts: layoutsWithStatic,
    breakpoints,
    cols,
    rowHeight,
    maxRows,
    autoSize: false,
    isDraggable,
    isResizable: isResizable ?? false,
    margin: [16, 16] as [number, number],
    containerPadding: [0, 0] as [number, number],
    useCSSTransforms: true,
    // Let widgets visually overlap during a drag/resize. RGL won't try to
    // displace anything; `layoutWithFlexibleDocks` (in the parent) decides the
    // final geometry on `onDragStop` / `onResizeStop`.
    allowOverlap: true,
    preventCollision: false,
    compactType: null,
    isBounded: maxRows != null,
    resizeHandles: ['sw', 'se', 'nw', 'ne'] as ('sw' | 'se' | 'nw' | 'ne')[],
    onResize: (
      layout: Layout[],
      _oldItem: Layout,
      newItem: Layout,
    ) => {
      const merged = { ...layouts, lg: layout };
      onResize?.(layout, merged, newItem);
      runLiveDockUpdate(newItem, layout);
    },
    onResizeStart: () => {
      isInteractingRef.current = true;
      setPlacementInvalid(false);
      snapshotPreGestureLayout();
      buildDockDomCache();
    },
    onResizeStop: (layout: Layout[]) => {
      setIsDragging(false);
      stopAutoScroll();
      resetLiveGestureTracking();
      clearLiveDockOverrides();
      commitLayout(layout);
      isInteractingRef.current = false;
      setPlacementInvalid(false);
      onResizeGestureEnd?.();
    },
    onLayoutChange: (layout: Layout[], _layouts: { [key: string]: Layout[] }) => {
      if (isInteractingRef.current) return;
      if (shouldIgnoreLayoutEvent()) return;
      commitLayout(layout);
    },
    onDragStart: (...args: [Layout[], Layout, Layout, Layout, MouseEvent]) => {
      const e = args[4];
      isInteractingRef.current = true;
      setIsDragging(true);
      setPlacementInvalid(false);
      snapshotPreGestureLayout();
      buildDockDomCache();
      if (enableAutoScroll) startAutoScroll(e);
    },
    onDrag: (
      layout: Layout[],
      _oldItem: Layout,
      newItem: Layout,
      _placeholder: Layout,
      e: MouseEvent,
    ) => {
      if (enableAutoScroll) updateAutoScroll(e);
      runLiveDockUpdate(newItem, layout);
    },
    onDragStop: (layout: Layout[]) => {
      setIsDragging(false);
      stopAutoScroll();
      resetLiveGestureTracking();
      clearLiveDockOverrides();
      commitLayout(layout);
      isInteractingRef.current = false;
      setPlacementInvalid(false);
    },
    draggableHandle: '.drag-handle',
    cancel: '.no-drag, .widget-header-actions, button, input, select, textarea, .widget-content, .widget-body, .card > *:not(.drag-handle)',
    transformScale: 1,
  }), [
    layouts,
    layoutsWithStatic,
    gridStyle,
    onResize,
    onResizeGestureEnd,
    isDraggable,
    isResizable,
    className,
    enableAutoScroll,
    rowHeight,
    maxRows,
    placementInvalid,
    shouldIgnoreLayoutEvent,
    commitLayout,
    runLiveDockUpdate,
    clearLiveDockOverrides,
    resetLiveGestureTracking,
    buildDockDomCache,
    computeLiveDockGesture,
    validateLivePlacement,
  ]);

  // ---------- Auto-scroll ----------------------------------------------------

  const startAutoScroll = (e: MouseEvent) => {
    updateAutoScroll(e);
  };

  const updateAutoScroll = (e: MouseEvent) => {
    const scrollThreshold = 80;
    const scrollSpeed = 8;
    const scrollDelay = 500;
    const windowHeight = window.innerHeight;
    const mouseY = e.clientY;

    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    if (scrollDelayRef.current) {
      clearTimeout(scrollDelayRef.current);
      scrollDelayRef.current = null;
    }

    const shouldScrollUp = mouseY < scrollThreshold && window.scrollY > 0;
    const shouldScrollDown =
      mouseY > windowHeight - scrollThreshold &&
      window.scrollY < document.documentElement.scrollHeight - window.innerHeight;

    if (!shouldScrollUp && !shouldScrollDown) return;

    scrollDelayRef.current = setTimeout(() => {
      if (shouldScrollUp) {
        scrollIntervalRef.current = setInterval(() => {
          if (window.scrollY > 0) window.scrollBy(0, -scrollSpeed);
          else stopAutoScroll();
        }, 16);
      } else {
        scrollIntervalRef.current = setInterval(() => {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          if (window.scrollY < maxScroll) window.scrollBy(0, scrollSpeed);
          else stopAutoScroll();
        }, 16);
      }
    }, scrollDelay);
  };

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    if (scrollDelayRef.current) {
      clearTimeout(scrollDelayRef.current);
      scrollDelayRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAutoScroll();
      cancelPendingGestureFrame();
      cancelLayoutResync();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [cancelPendingGestureFrame, cancelLayoutResync]);

  if (!layouts.lg || layouts.lg.length === 0) {
    console.error('WARNING: No lg layout provided to WidgetGrid!');
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${isDragging ? 'select-none dragging' : ''}`}
    >
      <ResponsiveGridLayout {...gridProps}>{children}</ResponsiveGridLayout>
    </div>
  );
};
