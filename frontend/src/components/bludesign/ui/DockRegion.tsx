/**
 * Left/right dock: floating icon buttons + panel when expanded.
 * Drag icons to reorder (fluid sibling motion) or undock when pointer leaves the dock shell.
 * Undock commits on first exit; onUndockDrag moves the real floating panel under the cursor until release.
 */

import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { startUICapture, endUICapture } from './UICapture';
import type { DockSideState, PanelId } from './panelLayoutV9';
import { DOCK_STACK_WIDTH_PX } from './panelLayoutV9';

export type DockTabItem = {
  id: PanelId;
  title: string;
  icon?: React.ReactNode;
  visible: boolean;
};

export type DockRegionProps = {
  side: 'left' | 'right';
  dock: DockSideState;
  tabs: DockTabItem[];
  activeId: PanelId | null;
  onSelect: (id: PanelId) => void;
  onToggleExpanded: () => void;
  onResizeWidth: (widthPx: number) => void;
  onUndockAt?: (id: PanelId, clientX: number, clientY: number) => void;
  onUndockDrag?: (id: PanelId, clientX: number, clientY: number) => void;
  /** Pointer released after undock-from-tab — apply same dock-shell / edge rules as float header drag-end. */
  onUndockGestureEnd?: (id: PanelId, clientX: number, clientY: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Float panel is dragging over this dock — emphasize shell (expanded: wash; collapsed: stacks with edge hint in parent). */
  dropHighlight?: boolean;
  children: React.ReactNode;
  zIndex?: number;
};

const MIN_DRAG_PX = 6;
const COLLAPSED_OUTER_W_PX = DOCK_STACK_WIDTH_PX + 10;

const dockEase = 'cubic-bezier(0.16, 1, 0.3, 1)';
const dockDurationMs = 320;
const reorderEase = 'cubic-bezier(0.2, 0.85, 0.25, 1)';

function insertPositionFromY(clientY: number, rects: DOMRect[]): number {
  if (rects.length === 0) return 0;
  if (clientY < rects[0].top) return 0;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (clientY >= r.top && clientY <= r.bottom) {
      const mid = r.top + r.height / 2;
      return clientY < mid ? i : i + 1;
    }
    if (i < rects.length - 1 && clientY > r.bottom && clientY < rects[i + 1].top) {
      return i + 1;
    }
  }
  return rects.length;
}

function reorderShiftY(i: number, from: number, insertSlot: number, dragH: number): number {
  if (i === from) return 0;
  if (from < insertSlot) {
    if (i > from && i < insertSlot) return -dragH;
  } else if (from > insertSlot) {
    if (i >= insertSlot && i < from) return dragH;
  }
  return 0;
}

function pointInRect(x: number, y: number, r: DOMRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

const ReorderGhost: React.FC<{
  x: number;
  y: number;
  tab: DockTabItem;
  expanded: boolean;
  isDark: boolean;
  selected: boolean;
}> = ({ x, y, tab, expanded, isDark, selected }) =>
  createPortal(
    <div
      className="pointer-events-none fixed z-[100049]"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <div
        className={`
          flex min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 shadow-xl backdrop-blur-md
          ${
            selected
              ? isDark
                ? 'border-[#147fd4]/50 bg-[#147fd4]/25'
                : 'border-[#147fd4]/45 bg-[#147fd4]/14'
              : isDark
                ? 'border-gray-600/50 bg-gray-900/95'
                : 'border-gray-200/90 bg-white/95'
          }
        `}
      >
        {tab.icon && <span className="text-primary-500">{tab.icon}</span>}
        {expanded && (
          <span
            className={`max-w-[3.75rem] text-center text-[10px] font-medium leading-tight ${
              isDark ? 'text-gray-200' : 'text-gray-800'
            }`}
          >
            {tab.title.length > 12 ? `${tab.title.slice(0, 10)}…` : tab.title}
          </span>
        )}
      </div>
    </div>,
    document.body
  );

export const DockRegion: React.FC<DockRegionProps> = ({
  side,
  dock,
  tabs,
  activeId,
  onSelect,
  onToggleExpanded,
  onResizeWidth,
  onUndockAt,
  onUndockDrag,
  onUndockGestureEnd,
  onReorder,
  dropHighlight = false,
  children,
  zIndex = 38,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const rootRef = useRef<HTMLDivElement>(null);
  const stackColumnRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef({ x: 0, width: 0 });
  const onResizeWidthRef = useRef(onResizeWidth);
  onResizeWidthRef.current = onResizeWidth;
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const visibleTabs = tabs.filter((t) => t.visible && dock.panelIds.includes(t.id));
  const expanded = dock.expanded;

  const [reorderLive, setReorderLive] = useState<null | {
    fromIndex: number;
    insertSlot: number;
    dragH: number;
    ghostX: number;
    ghostY: number;
  }>(null);

  const undockCommittedRef = useRef(false);
  const dragActiveRef = useRef(false);
  const snapshotRectsRef = useRef<DOMRect[] | null>(null);
  const lastInsertSlotRef = useRef(0);

  const outerWidthPx = expanded ? dock.widthPx : COLLAPSED_OUTER_W_PX;

  const handleResizeMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - resizeStartRef.current.x;
    const w0 = resizeStartRef.current.width;
    const next = side === 'left' ? w0 + dx : w0 - dx;
    onResizeWidthRef.current(next);
  }, [side]);

  const handleResizeUp = useCallback(() => {
    endUICapture();
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [handleResizeMove]);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      startUICapture('dock-resize');
      resizeStartRef.current = { x: e.clientX, width: dock.widthPx };
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    },
    [dock.widthPx, handleResizeMove, handleResizeUp]
  );

  const measureRowRects = useCallback((): DOMRect[] => {
    return rowRefs.current
      .slice(0, visibleTabs.length)
      .filter(Boolean)
      .map((el) => el!.getBoundingClientRect());
  }, [visibleTabs.length]);

  const resetDragUi = useCallback(() => {
    dragActiveRef.current = false;
    undockCommittedRef.current = false;
    snapshotRectsRef.current = null;
    setReorderLive(null);
  }, []);

  const handleTabPointerDown = useCallback(
    (e: React.PointerEvent, tabIndex: number, tab: DockTabItem) => {
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      snapshotRectsRef.current = null;
      lastInsertSlotRef.current = tabIndex;

      const canUndock = !!onUndockAt;
      const canReorder = !!onReorder && visibleTabs.length > 1;

      /** Keep orbit/placement from treating moves as scene input while a dock drag is active. */
      startUICapture(`dock-tab-${tab.id}`);

      /**
       * Capture on `documentElement`, not the dock root: undocking the last tab unmounts this
       * `DockRegion`, which would destroy capture on `rootRef` and break `onMove` / pointer delivery.
       */
      const pointerCaptureEl =
        typeof document !== 'undefined' ? document.documentElement : null;
      const pointerId = e.pointerId;
      if (pointerCaptureEl && pointerId != null) {
        try {
          pointerCaptureEl.setPointerCapture(pointerId);
        } catch {
          /* ignore if capture unsupported */
        }
      }

      const listenerOpts = { capture: true, passive: false } as const;

      let interactionFinished = false;

      const releaseCaptureSafe = () => {
        if (pointerCaptureEl && pointerId != null) {
          try {
            if (
              typeof pointerCaptureEl.hasPointerCapture === 'function' &&
              pointerCaptureEl.hasPointerCapture(pointerId)
            ) {
              pointerCaptureEl.releasePointerCapture(pointerId);
            }
          } catch {
            /* ignore */
          }
        }
      };

      const onMove = (ev: PointerEvent) => {
        if (dragActiveRef.current) {
          ev.preventDefault();
        }

        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (dist < MIN_DRAG_PX) return;

        if (!dragActiveRef.current) {
          dragActiveRef.current = true;
          snapshotRectsRef.current = measureRowRects();
        }

        const rootRect = rootRef.current?.getBoundingClientRect();

        // This dock's shell may already be unmounted (e.g. last tab undocked) — keep float following cursor.
        if (!rootRect && undockCommittedRef.current && canUndock) {
          setReorderLive(null);
          onUndockDrag?.(tab.id, ev.clientX, ev.clientY);
          return;
        }

        if (!rootRect) return;

        const inDock = pointInRect(ev.clientX, ev.clientY, rootRect);

        if (inDock && undockCommittedRef.current && canUndock) {
          setReorderLive(null);
          onUndockDrag?.(tab.id, ev.clientX, ev.clientY);
          return;
        }

        if (inDock && canReorder && !undockCommittedRef.current) {
          let rects = snapshotRectsRef.current;
          if (!rects || rects.length === 0) {
            rects = measureRowRects();
            snapshotRectsRef.current = rects;
          }
          const stackEl = stackColumnRef.current;
          let clientY = ev.clientY;
          if (stackEl) {
            const sr = stackEl.getBoundingClientRect();
            clientY = Math.min(Math.max(clientY, sr.top + 1), sr.bottom - 1);
          }
          const insertSlot = insertPositionFromY(clientY, rects);
          lastInsertSlotRef.current = insertSlot;
          const dragH = rects[tabIndex]?.height ?? 48;

          setReorderLive({
            fromIndex: tabIndex,
            insertSlot,
            dragH,
            ghostX: ev.clientX,
            ghostY: ev.clientY,
          });
          return;
        }

        if (!inDock && canUndock) {
          setReorderLive(null);
          if (!undockCommittedRef.current) {
            undockCommittedRef.current = true;
            onUndockAt!(tab.id, ev.clientX, ev.clientY);
          }
          onUndockDrag?.(tab.id, ev.clientX, ev.clientY);
        }
      };

      const endInteraction = (ev: PointerEvent) => {
        if (interactionFinished) return;
        interactionFinished = true;

        document.removeEventListener('pointermove', onMove, listenerOpts);
        document.removeEventListener('pointerup', endInteraction, listenerOpts);
        document.removeEventListener('pointercancel', endInteraction, listenerOpts);
        pointerCaptureEl?.removeEventListener('lostpointercapture', onLostCapture);
        releaseCaptureSafe();
        endUICapture();

        const tap =
          !dragActiveRef.current &&
          !undockCommittedRef.current &&
          Math.hypot(ev.clientX - startX, ev.clientY - startY) < MIN_DRAG_PX;
        if (tap) {
          onSelect(tab.id);
        }

        if (
          dragActiveRef.current &&
          !undockCommittedRef.current &&
          canReorder &&
          snapshotRectsRef.current &&
          snapshotRectsRef.current.length > 0
        ) {
          const rects = snapshotRectsRef.current;
          const stackEl = stackColumnRef.current;
          let clientY = ev.clientY;
          if (stackEl) {
            const sr = stackEl.getBoundingClientRect();
            clientY = Math.min(Math.max(clientY, sr.top + 1), sr.bottom - 1);
          }
          const insert = insertPositionFromY(clientY, rects);
          const from = tabIndex;
          let to = insert;
          if (from < insert) to -= 1;
          if (from !== to) {
            onReorder!(from, to);
          }
        }

        if (undockCommittedRef.current && canUndock) {
          onUndockGestureEnd?.(tab.id, ev.clientX, ev.clientY);
        }

        resetDragUi();
      };

      const onLostCapture = () => {
        if (interactionFinished) return;
        // Undock: FloatingPanel mounts under the cursor; some UAs release capture briefly.
        // Keep document pointer listeners until pointerup so the drag continues.
        if (undockCommittedRef.current && canUndock) {
          pointerCaptureEl?.removeEventListener('lostpointercapture', onLostCapture);
          return;
        }
        interactionFinished = true;

        document.removeEventListener('pointermove', onMove, listenerOpts);
        document.removeEventListener('pointerup', endInteraction, listenerOpts);
        document.removeEventListener('pointercancel', endInteraction, listenerOpts);
        pointerCaptureEl?.removeEventListener('lostpointercapture', onLostCapture);
        endUICapture();
        resetDragUi();
      };

      pointerCaptureEl?.addEventListener('lostpointercapture', onLostCapture);

      document.addEventListener('pointermove', onMove, listenerOpts);
      document.addEventListener('pointerup', endInteraction, listenerOpts);
      document.addEventListener('pointercancel', endInteraction, listenerOpts);
    },
    [
      measureRowRects,
      onReorder,
      onSelect,
      onUndockAt,
      onUndockDrag,
      onUndockGestureEnd,
      resetDragUi,
      visibleTabs.length,
    ]
  );

  const collapseIcon =
    side === 'left' ? (
      expanded ? (
        <ChevronDoubleLeftIcon className="h-5 w-5 flex-shrink-0 text-primary-500 transition-transform duration-300 ease-out" />
      ) : (
        <ChevronDoubleRightIcon className="h-5 w-5 flex-shrink-0 text-primary-500 transition-transform duration-300 ease-out" />
      )
    ) : expanded ? (
      <ChevronDoubleRightIcon className="h-5 w-5 flex-shrink-0 text-primary-500 transition-transform duration-300 ease-out" />
    ) : (
      <ChevronDoubleLeftIcon className="h-5 w-5 flex-shrink-0 text-primary-500 transition-transform duration-300 ease-out" />
    );

  /** Match tab icon chips: same padding/size, icon only (no label). */
  const collapseButton = (
    <button
      type="button"
      className={`
        dock-float-btn flex w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2
        border shadow-md backdrop-blur-sm transition-[box-shadow,background-color,border-color] duration-200 ease-out
        active:scale-[0.96] cursor-pointer touch-none select-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50
        ${isDark ? 'border-gray-600/45 bg-gray-900/85 text-primary-500 hover:bg-gray-800/95' : 'border-gray-200/90 bg-white/90 text-primary-500 hover:bg-white shadow-gray-900/5'}
      `}
      title={expanded ? 'Collapse dock' : 'Expand dock'}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse dock' : 'Expand dock'}
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpanded();
      }}
    >
      {collapseIcon}
    </button>
  );

  const panelChrome = isDark
    ? 'border-gray-700/60 bg-gray-900/95 border shadow-2xl'
    : 'border-gray-300/60 bg-white/95 border shadow-2xl';

  const contentSlideNudge = expanded ? '' : side === 'left' ? '-translate-x-1.5' : 'translate-x-1.5';

  const contentShell = (
    <div
      className={`
        relative flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden rounded-lg
        transition-[opacity,transform,flex-basis] duration-300 ease-out motion-reduce:transition-none
        ${panelChrome}
        ${
          expanded
            ? 'opacity-100 flex-[1_1_auto] translate-x-0 pointer-events-auto'
            : `opacity-0 flex-[0_0_0] max-w-0 min-w-0 overflow-hidden pointer-events-none ${contentSlideNudge}`
        }
      `}
      style={{ transitionTimingFunction: expanded ? dockEase : 'ease-in' }}
      aria-hidden={!expanded}
    >
      <div
        className={`dock-content-scroll flex-1 min-w-0 overflow-y-auto overflow-x-hidden ${
          isDark ? 'text-gray-200' : 'text-gray-800'
        }`}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: isDark
            ? 'rgba(156, 163, 175, 0.5) rgba(31, 41, 55, 0.3)'
            : 'rgba(107, 114, 128, 0.5) rgba(229, 231, 235, 0.5)',
        }}
      >
        <div className="p-3">{children}</div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        className={`absolute top-0 bottom-0 z-10 w-3 cursor-ew-resize hover:bg-primary-500/20 transition-colors duration-200 ${
          side === 'left' ? 'right-0' : 'left-0'
        }`}
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );

  return (
    <>
      <div
        ref={rootRef}
        data-ui-element="true"
        data-bludesign-dock="true"
        data-bludesign-dock-side={side}
        data-bludesign-dock-expanded={expanded ? 'true' : 'false'}
        className="flex pointer-events-auto overflow-visible will-change-[width]"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          ...(side === 'left' ? { left: 0 } : { right: 0 }),
          width: outerWidthPx,
          zIndex,
          flexDirection: 'row',
          transition: `width ${dockDurationMs}ms ${dockEase}`,
        }}
      >
        {dropHighlight && (
          <div
            className={`
              pointer-events-none absolute inset-0 z-[25] rounded-lg transition-opacity duration-200 ease-out
              ${isDark ? 'bg-primary-500/12 ring-2 ring-inset ring-primary-500/40' : 'bg-primary-500/10 ring-2 ring-inset ring-primary-500/35'}
            `}
            aria-hidden
          />
        )}
        {side === 'left' ? (
          <>
            {contentShell}
            <div
              ref={stackColumnRef}
              className="shrink-0 flex flex-col items-stretch justify-start self-start pl-1"
              style={{ width: DOCK_STACK_WIDTH_PX, paddingTop: '0.75rem' }}
            >
              <div className="relative flex max-h-[min(92vh,calc(100vh-6rem))] flex-col gap-1.5 overflow-y-auto overflow-x-hidden scrollbar-thin">
                <div
                  data-bludesign-dock-stack
                  className="relative flex flex-col gap-1.5 items-stretch pt-1"
                  role="tablist"
                  aria-orientation="vertical"
                  aria-expanded={expanded}
                >
                  {visibleTabs.map((tab, index) => {
                    const selected = tab.id === activeId;
                    const from = reorderLive?.fromIndex;
                    const insertSlot = reorderLive?.insertSlot ?? -1;
                    const dragH = reorderLive?.dragH ?? 0;
                    const shifting = reorderLive !== null && from !== undefined && insertSlot >= 0;
                    const ty =
                      shifting && from !== undefined
                        ? reorderShiftY(index, from, insertSlot, dragH)
                        : 0;
                    const hideRow = reorderLive?.fromIndex === index;

                    return (
                      <div
                        key={tab.id}
                        ref={(el) => {
                          rowRefs.current[index] = el;
                        }}
                        className="min-w-0"
                        style={{
                          transform: ty !== 0 ? `translateY(${ty}px)` : undefined,
                          transition: reorderLive ? `transform 220ms ${reorderEase}` : undefined,
                          opacity: hideRow ? 0 : 1,
                        }}
                      >
                        <DockTabButton
                          tab={tab}
                          selected={selected}
                          expanded={expanded}
                          isDark={isDark}
                          onPointerDown={(ev) => handleTabPointerDown(ev, index, tab)}
                          onKeySelect={() => onSelect(tab.id)}
                        />
                      </div>
                    );
                  })}
                </div>
                {collapseButton}
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              ref={stackColumnRef}
              className="shrink-0 flex flex-col items-stretch justify-start self-start pr-1"
              style={{ width: DOCK_STACK_WIDTH_PX, paddingTop: '0.75rem' }}
            >
              <div className="relative flex max-h-[min(92vh,calc(100vh-6rem))] flex-col gap-1.5 overflow-y-auto overflow-x-hidden scrollbar-thin">
                <div
                  data-bludesign-dock-stack
                  className="relative flex flex-col gap-1.5 items-stretch pt-1"
                  role="tablist"
                  aria-orientation="vertical"
                  aria-expanded={expanded}
                >
                  {visibleTabs.map((tab, index) => {
                    const selected = tab.id === activeId;
                    const from = reorderLive?.fromIndex;
                    const insertSlot = reorderLive?.insertSlot ?? -1;
                    const dragH = reorderLive?.dragH ?? 0;
                    const shifting = reorderLive !== null && from !== undefined && insertSlot >= 0;
                    const ty =
                      shifting && from !== undefined
                        ? reorderShiftY(index, from, insertSlot, dragH)
                        : 0;
                    const hideRow = reorderLive?.fromIndex === index;

                    return (
                      <div
                        key={tab.id}
                        ref={(el) => {
                          rowRefs.current[index] = el;
                        }}
                        className="min-w-0"
                        style={{
                          transform: ty !== 0 ? `translateY(${ty}px)` : undefined,
                          transition: reorderLive ? `transform 220ms ${reorderEase}` : undefined,
                          opacity: hideRow ? 0 : 1,
                        }}
                      >
                        <DockTabButton
                          tab={tab}
                          selected={selected}
                          expanded={expanded}
                          isDark={isDark}
                          onPointerDown={(ev) => handleTabPointerDown(ev, index, tab)}
                          onKeySelect={() => onSelect(tab.id)}
                        />
                      </div>
                    );
                  })}
                </div>
                {collapseButton}
              </div>
            </div>
            {contentShell}
          </>
        )}
      </div>
      {reorderLive && visibleTabs[reorderLive.fromIndex] && (
        <ReorderGhost
          x={reorderLive.ghostX}
          y={reorderLive.ghostY}
          tab={visibleTabs[reorderLive.fromIndex]}
          expanded={expanded}
          isDark={isDark}
          selected={visibleTabs[reorderLive.fromIndex].id === activeId}
        />
      )}
    </>
  );
};

const DockTabButton: React.FC<{
  tab: DockTabItem;
  selected: boolean;
  expanded: boolean;
  isDark: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeySelect: () => void;
}> = ({ tab, selected, expanded, isDark, onPointerDown, onKeySelect }) => (
  <button
    type="button"
    role="tab"
    aria-selected={selected}
    tabIndex={selected ? 0 : -1}
    className={`
      dock-float-btn flex w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-left
      border shadow-md backdrop-blur-sm transition-[box-shadow,background-color,border-color] duration-200 ease-out
      active:scale-[0.96] cursor-grab active:cursor-grabbing touch-none select-none
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50
      ${
        selected
          ? isDark
            ? 'border-[#147fd4]/50 bg-[#147fd4]/20 text-white shadow-[#147fd4]/15 ring-1 ring-[#147fd4]/35'
            : 'border-[#147fd4]/45 bg-[#147fd4]/12 text-gray-900 shadow-[#147fd4]/10 ring-1 ring-[#147fd4]/30'
          : isDark
            ? 'border-gray-600/45 bg-gray-900/85 text-gray-300 hover:bg-gray-800/95'
            : 'border-gray-200/90 bg-white/90 text-gray-700 hover:bg-white shadow-gray-900/5'
      }
    `}
    onPointerDown={onPointerDown}
    onKeyDown={(e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onKeySelect();
    }}
    title={tab.title}
  >
    {tab.icon && <span className="flex-shrink-0 text-primary-500">{tab.icon}</span>}
    {expanded && (
      <span
        className={`max-w-[3.75rem] text-center text-[10px] font-medium leading-tight break-words ${
          isDark ? 'text-gray-200' : 'text-gray-800'
        }`}
      >
        {tab.title.length > 14 ? `${tab.title.slice(0, 12)}…` : tab.title}
      </span>
    )}
  </button>
);
