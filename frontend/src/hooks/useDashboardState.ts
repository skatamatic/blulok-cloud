import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout } from 'react-grid-layout';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import {
  WidgetInstance,
  DashboardPageState,
  DashboardLayoutApiResponse,
  DashboardLayoutSource,
  DASHBOARD_STORAGE_KEY,
  MAX_DASHBOARD_PAGES,
} from '@/types/widget-management.types';
import { WidgetSize } from '@/types/widget.types';
import { getWidgetType } from '@/config/widgetRegistry';
import { gridToSize } from '@/utils/widget-size.utils';
import {
  findPlacementWithDockReflow,
  reflowDockLayout,
  buildDefaultStaffLayouts,
  buildDefaultTenantLayouts,
  GridLayoutItem,
  isDockSize,
  validateProposedFreeLayout,
  computeLiveDockRects as computeLiveDockRectsEngine,
  liveGridGestureSig,
  hasFreeWidgetOverlap,
} from '@/utils/dashboard-layout-engine';
import {
  syncPageWithClampedLayout,
  isPersistedPageId,
} from '@/utils/dashboard-state.utils';
import {
  pageFromApiWidgets,
  pagesToSavePayload,
  applyWidgetSizeToPage,
  applyLayoutsToPage,
  buildProposedFreeFromGesture,
  derivePreviewResizeTier,
  isLivePlacementAccepted,
  normalizeApiPageWidgets,
  type ApiPageWidgetInput,
} from '@/utils/dashboard-persistence.utils';

const MAX_WIDGETS_PER_PAGE = 12;
const SAVE_DEBOUNCE_MS = 500;

function createDefaultPage(isTenant: boolean, id = 'local-default'): DashboardPageState {
  const defaultLayouts = isTenant ? buildDefaultTenantLayouts() : buildDefaultStaffLayouts();
  const instances: WidgetInstance[] = defaultLayouts.lg.map((item) => {
    const idToType: Record<string, string> = {
      facilities: 'stats-facilities',
      devices: 'stats-devices',
      users: 'stats-users',
      alerts: 'stats-alerts',
      'units-manager': 'units-manager',
    };
    const type = idToType[item.i] ?? item.i;
    const cfg = getWidgetType(type);
    return {
      id: item.i,
      type,
      title: cfg?.name ?? item.i,
      size: gridToSize(item.w, item.h),
    };
  });

  return {
    id,
    name: 'Main',
    pageOrder: 0,
    widgetInstances: instances,
    layouts: defaultLayouts,
  };
}

function persistLocal(state: {
  pages: DashboardPageState[];
  activePageId: string;
  focusedWidgetId?: string | null;
}) {
  try {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem('blulok-widget-layouts');
    localStorage.removeItem('blulok-widget-instances');
  } catch {
    // ignore
  }
}

export interface UseDashboardStateOptions {
  isAuthenticated: boolean;
  isTenant: boolean;
  activeFacilityId?: string | null;
}

export function useDashboardState({
  isAuthenticated,
  isTenant,
  activeFacilityId,
}: UseDashboardStateOptions) {
  const { addToast } = useToast();
  const [pages, setPages] = useState<DashboardPageState[]>(() => [
    createDefaultPage(isTenant),
  ]);
  const [activePageId, setActivePageId] = useState<string>(
    () => pages[0]?.id ?? 'local-default'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [slideDirection, setSlideDirection] = useState(0);
  const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null);
  const [layoutSource, setLayoutSource] = useState<DashboardLayoutSource>('default');
  const [canEditLayout, setCanEditLayout] = useState(false);
  const [allowMultiplePages, setAllowMultiplePages] = useState(false);
  const [assignedDashboardName, setAssignedDashboardName] = useState<string | undefined>();
  const [assignedDashboardId, setAssignedDashboardId] = useState<string | undefined>();
  const [hasAssignedOverride, setHasAssignedOverride] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagesRef = useRef(pages);
  const layoutDirtyRef = useRef(false);
  const suppressLayoutChangeUntilRef = useRef(0);
  const layoutAdjustedNotifiedRef = useRef(false);
  const allowMultiplePagesRef = useRef(false);
  /** Live resize content-tier preview — avoids rewriting `pages` on every grid step. */
  const previewResizeRef = useRef<{
    pageId: string;
    widgetId: string;
    size: WidgetSize;
    gridSig: string;
  } | null>(null);
  const [previewResizeVersion, setPreviewResizeVersion] = useState(0);

  useEffect(() => {
    allowMultiplePagesRef.current = allowMultiplePages;
  }, [allowMultiplePages]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const activePageIndex = useMemo(
    () => Math.max(0, pages.findIndex((p) => p.id === activePageId)),
    [pages, activePageId]
  );

  const activePage = pages[activePageIndex] ?? pages[0];

  const scheduleSave = useCallback(() => {
    if (!canEditLayout) return;
    layoutDirtyRef.current = true;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      apiService
        .saveDashboard(
          pagesToSavePayload(pagesRef.current),
          isPersistedPageId(activePageId) ? activePageId : undefined
        )
        .then(() => {
          layoutDirtyRef.current = false;
        })
        .catch((err) => {
          console.error('Failed to save dashboard:', err);
          const apiMessage = err?.response?.data?.message as string | undefined;
          if (apiMessage) {
            addToast({
              type: 'error',
              title: 'Could not save dashboard',
              message: apiMessage,
            });
          }
        });
    }, SAVE_DEBOUNCE_MS);
  }, [activePageId, addToast, canEditLayout]);

  const flushSave = useCallback(() => {
    if (!canEditLayout) return Promise.resolve();
    layoutDirtyRef.current = true;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return apiService
      .saveDashboard(
        pagesToSavePayload(pagesRef.current),
        isPersistedPageId(activePageId) ? activePageId : undefined
      )
      .then(() => {
        layoutDirtyRef.current = false;
      })
      .catch((err) => {
        console.error('Failed to save dashboard:', err);
        throw err;
      });
  }, [activePageId, canEditLayout]);

  const commitPages = useCallback(
    (
      next: DashboardPageState[],
      activeId: string = activePageId,
      options?: { save?: boolean }
    ) => {
      setPages(next);
      persistLocal({ pages: next, activePageId: activeId, focusedWidgetId });
      if (options?.save !== false) {
        scheduleSave();
      }
    },
    [activePageId, scheduleSave, focusedWidgetId]
  );

  const updatePageById = useCallback(
    (
      pageId: string,
      updater: (page: DashboardPageState) => DashboardPageState,
      options?: { flushSave?: boolean }
    ) => {
      setPages((prev) => {
        const next = prev.map((p) => (p.id === pageId ? updater(p) : p));
        pagesRef.current = next;
        persistLocal({ pages: next, activePageId, focusedWidgetId });
        scheduleSave();
        if (options?.flushSave) {
          void flushSave().catch((err) => {
            console.error('Failed to save dashboard:', err);
            const apiMessage = err?.response?.data?.message as string | undefined;
            addToast({
              type: 'error',
              title: 'Could not save dashboard',
              message: apiMessage ?? 'Your layout changes may not persist after refresh.',
            });
          });
        }
        return next;
      });
    },
    [activePageId, scheduleSave, focusedWidgetId, flushSave, addToast]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const replaceFromApiResponse = useCallback(
    (response: DashboardLayoutApiResponse, options?: { ignoreStoredFocus?: boolean }) => {
      layoutDirtyRef.current = false;
      if (response.layoutSource) setLayoutSource(response.layoutSource);
      if (response.canEditLayout !== undefined) setCanEditLayout(response.canEditLayout);
      if (response.allowMultiplePages !== undefined) {
        setAllowMultiplePages(response.allowMultiplePages);
      }
      setAssignedDashboardName(response.assignedDashboardName);
      setAssignedDashboardId(response.assignedDashboardId);
      setHasAssignedOverride(response.hasAssignedOverride ?? false);

      const multiPage = response.allowMultiplePages ?? allowMultiplePagesRef.current;
      const apiPages = response.pages;
      let totalDropped = 0;

      if (apiPages && apiPages.length > 0) {
        const loaded = apiPages.map((p) => {
          const { page, droppedCount } = pageFromApiWidgets(
            p.id ?? `local-${p.pageOrder}`,
            p.name,
            p.pageOrder,
            normalizeApiPageWidgets(p.widgets ?? [])
          );
          totalDropped += droppedCount;
          return page;
        });

        const stored = options?.ignoreStoredFocus
          ? null
          : localStorage.getItem(DASHBOARD_STORAGE_KEY);
        let activeId = loaded[0]?.id ?? 'local-default';
        let storedFocusedId: string | null = null;
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as {
              activePageId?: string;
              focusedWidgetId?: string | null;
            };
            if (
              parsed.activePageId &&
              loaded.some((pg) => pg.id === parsed.activePageId)
            ) {
              activeId = parsed.activePageId;
            }
            if (parsed.focusedWidgetId) {
              storedFocusedId = parsed.focusedWidgetId;
            }
          } catch {
            // ignore
          }
        }

        const finalPages = multiPage
          ? loaded
          : [loaded[0] ?? createDefaultPage(isTenant)];

        if (totalDropped > 0 && !layoutAdjustedNotifiedRef.current) {
          layoutAdjustedNotifiedRef.current = true;
          addToast({
            type: 'info',
            title: 'Dashboard layout adjusted',
            message:
              'Some widgets were repositioned to fit the screen without scrolling.',
          });
        }

        setPages(finalPages);
        setActivePageId(activeId);
        setFocusedWidgetId(null);
        if (storedFocusedId) {
          const hostPage = finalPages.find((p) =>
            p.widgetInstances.some((w) => w.id === storedFocusedId)
          );
          if (hostPage) {
            activeId = hostPage.id;
            setFocusedWidgetId(storedFocusedId);
          }
        }
        persistLocal({
          pages: finalPages,
          activePageId: activeId,
          focusedWidgetId: storedFocusedId ?? null,
        });
        return;
      }

      const legacyLayouts = response.layouts;
      if (Array.isArray(legacyLayouts) && legacyLayouts.length > 0) {
        const { page, droppedCount } = pageFromApiWidgets(
          'legacy-main',
          'Main',
          0,
          normalizeApiPageWidgets(legacyLayouts as ApiPageWidgetInput[])
        );
        totalDropped += droppedCount;
        setPages([page]);
        setActivePageId(page.id);
        setFocusedWidgetId(null);
        persistLocal({ pages: [page], activePageId: page.id, focusedWidgetId: null });
        if (droppedCount > 0 && !layoutAdjustedNotifiedRef.current) {
          layoutAdjustedNotifiedRef.current = true;
          addToast({
            type: 'info',
            title: 'Dashboard layout adjusted',
            message:
              'Some widgets were repositioned to fit the screen without scrolling.',
          });
        }
      }
    },
    [isTenant, addToast]
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const response = await apiService.getWidgetLayouts(activeFacilityId);
        replaceFromApiResponse(response);
      } catch (error) {
        console.warn('Failed to load dashboard, using defaults:', error);
        const def = createDefaultPage(isTenant);
        setPages([def]);
        setActivePageId(def.id);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [isAuthenticated, isTenant, activeFacilityId, replaceFromApiResponse]);

  const resetPersonalLayout = useCallback(async () => {
    try {
      const response = await apiService.resetWidgetLayout(activeFacilityId);
      replaceFromApiResponse(response, { ignoreStoredFocus: true });
      addToast({
        type: 'success',
        title: 'Dashboard reset',
        message: 'Showing assigned or default layout.',
      });
      return true;
    } catch {
      addToast({
        type: 'error',
        title: 'Reset failed',
        message: 'Could not clear your personal dashboard.',
      });
      return false;
    }
  }, [activeFacilityId, replaceFromApiResponse, addToast]);

  const tryApplyRemoteLayout = useCallback(
    (response: DashboardLayoutApiResponse) => {
      if (layoutDirtyRef.current || saveTimerRef.current) {
        addToast({
          type: 'info',
          title: 'Dashboard updated',
          message:
            'Your organization changed the dashboard layout. Keep editing or refresh the page to apply it.',
        });
        return false;
      }
      replaceFromApiResponse(response);
      return true;
    },
    [replaceFromApiResponse, addToast]
  );

  const setActivePage = useCallback(
    (index: number, direction?: number) => {
      if (index < 0 || index >= pages.length) return;
      setSlideDirection(direction ?? (index > activePageIndex ? 1 : -1));
      const id = pages[index].id;
      setActivePageId(id);
      // Switching pages always exits fullscreen
      setFocusedWidgetId(null);
      persistLocal({ pages, activePageId: id, focusedWidgetId: null });
    },
    [pages, activePageIndex]
  );

  const enterFullscreen = useCallback(
    (widgetId: string) => {
      let hostPageId: string | null = null;
      let widget: WidgetInstance | undefined;
      for (const page of pages) {
        const match = page.widgetInstances.find((w) => w.id === widgetId);
        if (match) {
          hostPageId = page.id;
          widget = match;
          break;
        }
      }
      if (!widget || !hostPageId) return;
      const def = getWidgetType(widget.type);
      if (!def?.supportsFullscreen) {
        addToast({
          type: 'info',
          title: 'Fullscreen not available',
          message: 'This widget does not support fullscreen.',
        });
        return;
      }
      setActivePageId(hostPageId);
      setFocusedWidgetId(widgetId);
      persistLocal({ pages, activePageId: hostPageId, focusedWidgetId: widgetId });
    },
    [pages, addToast]
  );

  const exitFullscreen = useCallback(() => {
    setFocusedWidgetId(null);
    persistLocal({ pages, activePageId, focusedWidgetId: null });
  }, [pages, activePageId]);

  const addPage = useCallback(async (): Promise<number | null> => {
    if (!allowMultiplePages || pages.length >= MAX_DASHBOARD_PAGES) return null;

    const defaultName = `Page ${pages.length + 1}`;
    const newPage: DashboardPageState = {
      id: `local-${Date.now()}`,
      name: defaultName,
      pageOrder: pages.length,
      widgetInstances: [],
      layouts: { lg: [], md: [], sm: [] },
    };

    const next = [...pages, newPage].map((p, i) => ({ ...p, pageOrder: i }));
    const newIndex = next.length - 1;
    setSlideDirection(1);
    setActivePageId(newPage.id);
    commitPages(next, newPage.id);

    try {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await apiService.saveDashboard(pagesToSavePayload(next), undefined);
    } catch (e) {
      console.error('Failed to save new dashboard page:', e);
      addToast({
        type: 'error',
        title: 'Could not save page',
        message: 'The new dashboard page may not persist after refresh.',
      });
    }

    return newIndex;
  }, [allowMultiplePages, pages, commitPages, addToast]);

  const removePage = useCallback(
    async (index: number) => {
      if (!allowMultiplePages || pages.length <= 1) return;
      const target = pages[index];
      if (!target) return;

      if (target.widgetInstances.length > 0) {
        const ok = window.confirm(
          `Remove "${target.name}" and all ${target.widgetInstances.length} widget(s) on it?`
        );
        if (!ok) return;
      }

      const next = pages
        .filter((_, i) => i !== index)
        .map((p, i) => ({ ...p, pageOrder: i }));
      const newIndex = Math.min(
        index >= activePageIndex ? activePageIndex : activePageIndex - 1,
        next.length - 1
      );
      const newActiveId = next[Math.max(0, newIndex)]?.id ?? next[0].id;
      setSlideDirection(index < activePageIndex ? -1 : 1);
      setActivePageId(newActiveId);
      commitPages(next, newActiveId);

      try {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        await apiService.saveDashboard(pagesToSavePayload(next), newActiveId);
      } catch (e) {
        console.error('Failed to remove dashboard page:', e);
        addToast({ type: 'error', title: 'Could not remove page' });
      }
    },
    [allowMultiplePages, pages, activePageIndex, commitPages, addToast]
  );

  const setPageName = useCallback(
    (index: number, name: string) => {
      if (!allowMultiplePages) return;
      const target = pages[index];
      if (!target) return;

      const trimmed = name.trim() || `Page ${index + 1}`;
      if (trimmed === target.name) return;

      const next = pages.map((p, i) => (i === index ? { ...p, name: trimmed } : p));
      commitPages(next);
    },
    [allowMultiplePages, pages, commitPages]
  );

  const handleLayoutChangeForPage = useCallback(
    (pageId: string) =>
      (
        _layout: Layout[],
        newLayouts: { [key: string]: Layout[] }
      ): boolean | void => {
        if (Date.now() < suppressLayoutChangeUntilRef.current) {
          return;
        }
        if (previewResizeRef.current?.pageId === pageId) {
          previewResizeRef.current = null;
          setPreviewResizeVersion((v) => v + 1);
        }
        const page = pagesRef.current.find((p) => p.id === pageId);
        if (!page) return;

        // Strict placement validation: every free widget must keep its proposed
        // position after the dock-aware reflow. If anything would be pushed
        // (overlap with another free widget, or a dock that hit its min size),
        // we reject and let WidgetGrid revert via its remount mechanism.
        const dockIds = new Set(
          page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
        );
        const proposedFree = (newLayouts.lg ?? []).filter(
          (item) => !dockIds.has(item.i)
        ) as GridLayoutItem[];
        const { accepted } = validateProposedFreeLayout(
          proposedFree,
          page.widgetInstances
        );
        if (!accepted) return false;

        updatePageById(pageId, (page) =>
          applyLayoutsToPage(page, newLayouts)
        );
        return true;
      },
    [updatePageById]
  );

  /**
   * Returns a callback (memoised per page id) that WidgetGrid invokes during a
   * live drag/resize to compute where the page's docks should appear *right
   * now*. The engine treats the dragged item's current (sub-grid-snapped)
   * position as a free-widget intrusion and reports each dock's would-be
   * rect; WidgetGrid then applies these as inline transforms on the dock DOM
   * nodes (RGL's own layout is locked while `activeDrag` is set, so we can't
   * push them through props during the gesture).
   */
  const computeLiveDockRectsForPage = useCallback(
    (pageId: string) =>
      (liveItem: Layout, freeLayout: Layout[]) => {
        const page = pagesRef.current.find((p) => p.id === pageId);
        if (!page) return new Map();
        const dockIds = new Set(
          page.widgetInstances
            .filter((w) => isDockSize(w.size))
            .map((w) => w.id)
        );
        const free = freeLayout.filter(
          (item) => !dockIds.has(item.i)
        ) as GridLayoutItem[];
        const live = liveItem as GridLayoutItem;
        return computeLiveDockRectsEngine(free, live, page.widgetInstances);
      },
    []
  );

  const computeLiveDockGestureForPage = useCallback(
    (pageId: string) =>
      (liveItem: Layout, freeLayout: Layout[]) => {
        const page = pagesRef.current.find((p) => p.id === pageId);
        if (!page) return { rects: new Map(), accepted: true };

        const dockIds = new Set(
          page.widgetInstances
            .filter((w) => isDockSize(w.size))
            .map((w) => w.id)
        );

        const allLayout = (page.layouts.lg ?? []).map((item) => {
          const fromGesture = freeLayout.find((f) => f.i === item.i);
          return (fromGesture ?? item) as GridLayoutItem;
        });

        if (dockIds.size === 0) {
          const proposed = buildProposedFreeFromGesture(
            liveItem as GridLayoutItem,
            allLayout,
            page
          );
          return {
            rects: new Map(),
            accepted: !hasFreeWidgetOverlap(proposed),
          };
        }

        const proposed = buildProposedFreeFromGesture(
          liveItem as GridLayoutItem,
          allLayout,
          page
        );
        const { accepted, reflowed } = validateProposedFreeLayout(
          proposed,
          page.widgetInstances
        );

        const rects = new Map<string, GridLayoutItem>();
        for (const item of reflowed) {
          if (dockIds.has(item.i)) rects.set(item.i, item);
        }

        return { rects, accepted };
      },
    []
  );

  const validateLivePlacementForPage = useCallback(
    (pageId: string) =>
      (liveItem: Layout, allLayout: Layout[]) => {
        const page = pagesRef.current.find((p) => p.id === pageId);
        if (!page) return true;
        return isLivePlacementAccepted(
          liveItem as GridLayoutItem,
          allLayout as GridLayoutItem[],
          page
        );
      },
    []
  );

  const handleGridResizeForPage = useCallback(
    (pageId: string) =>
      (
        _layout: Layout[],
        newLayouts: { [key: string]: Layout[] },
        resizingItem: Layout
      ) => {
        if (Date.now() < suppressLayoutChangeUntilRef.current) {
          return;
        }

        const gridSig = liveGridGestureSig(resizingItem);
        const prev = previewResizeRef.current;
        if (
          prev?.pageId === pageId &&
          prev.widgetId === resizingItem.i &&
          prev.gridSig === gridSig
        ) {
          return;
        }

        const page = pagesRef.current.find((p) => p.id === pageId);
        if (!page) return;

        const item = (newLayouts.lg ?? []).find(
          (l) => l.i === resizingItem.i
        ) as GridLayoutItem | undefined;
        const widget = page.widgetInstances.find((w) => w.id === resizingItem.i);
        if (!widget) return;

        const nextSize = derivePreviewResizeTier(widget, item);
        if (!nextSize) {
          if (prev?.pageId === pageId && prev?.widgetId === resizingItem.i) {
            previewResizeRef.current = null;
            setPreviewResizeVersion((v) => v + 1);
          }
          return;
        }

        previewResizeRef.current = {
          pageId,
          widgetId: resizingItem.i,
          size: nextSize,
          gridSig,
        };
        setPreviewResizeVersion((v) => v + 1);
      },
    []
  );

  const clearPreviewResizeForPage = useCallback((pageId: string) => {
    if (previewResizeRef.current?.pageId !== pageId) return;
    previewResizeRef.current = null;
    setPreviewResizeVersion((v) => v + 1);
  }, []);

  const getWidgetDisplaySizeForPage = useCallback(
    (pageId: string) =>
      (widgetId: string, committedSize: WidgetSize): WidgetSize => {
        void previewResizeVersion;
        const preview = previewResizeRef.current;
        if (
          preview?.pageId === pageId &&
          preview.widgetId === widgetId
        ) {
          return preview.size;
        }
        return committedSize;
      },
    [previewResizeVersion]
  );

  const handleGridResizeStopForPage = useCallback(
    (pageId: string) =>
      (_layout: Layout[], newLayouts: { [key: string]: Layout[] }) => {
        if (Date.now() < suppressLayoutChangeUntilRef.current) {
          return;
        }
        updatePageById(pageId, (page) =>
          applyLayoutsToPage(page, newLayouts)
        );
      },
    [updatePageById]
  );

  const handleLayoutSaveForPage = useCallback(
    (pageId: string) => async (newLayouts: { [key: string]: Layout[] }) => {
      handleLayoutChangeForPage(pageId)([], newLayouts);
    },
    [handleLayoutChangeForPage]
  );

  const handleLayoutChange = useCallback(
    (_layout: Layout[], newLayouts: { [key: string]: Layout[] }) => {
      handleLayoutChangeForPage(activePageId)(_layout, newLayouts);
    },
    [activePageId, handleLayoutChangeForPage]
  );

  const handleLayoutSave = useCallback(
    async (newLayouts: { [key: string]: Layout[] }) => {
      await handleLayoutSaveForPage(activePageId)(newLayouts);
    },
    [activePageId, handleLayoutSaveForPage]
  );

  const updateWidgetSize = useCallback(
    (widgetId: string, newSize: WidgetSize) => {
      suppressLayoutChangeUntilRef.current = Date.now() + 2000;
      const currentPage = pagesRef.current.find((p) => p.id === activePageId);
      const wasDocked =
        currentPage?.widgetInstances.some(
          (w) => w.id === widgetId && isDockSize(w.size)
        ) ?? false;
      updatePageById(
        activePageId,
        (page) => {
          const updated = applyWidgetSizeToPage(page, widgetId, newSize);
          if (!updated) {
            const widget = page.widgetInstances.find((w) => w.id === widgetId);
            const def = widget ? getWidgetType(widget.type) : undefined;
            const fullscreenHint = def?.supportsFullscreen
              ? ' Tip: use Fullscreen to view this widget solo.'
              : '';
            let message = 'Free up space or choose a smaller size.';
            if (isDockSize(newSize)) {
              message =
                'That dock layout does not fit with the current widgets at the minimum allowed size.';
            }
            addToast({
              type: 'warning',
              title: 'Size doesn’t fit',
              message: message + fullscreenHint,
            });
            return page;
          }
          return updated;
        },
        { flushSave: isDockSize(newSize) || wasDocked }
      );
    },
    [activePageId, updatePageById, addToast]
  );

  const removeWidget = useCallback(
    async (widgetId: string) => {
      const pageIdParam = isPersistedPageId(activePageId)
        ? activePageId
        : undefined;
      try {
        await apiService.hideWidget(widgetId, pageIdParam);
      } catch (e) {
        console.error('Failed to hide widget:', e);
        addToast({ type: 'error', title: 'Could not remove widget' });
        return;
      }

      if (focusedWidgetId === widgetId) {
        setFocusedWidgetId(null);
      }

      updatePageById(activePageId, (page) => {
        const lg = (page.layouts.lg as GridLayoutItem[]).filter(
          (item) => item.i !== widgetId
        );
        return syncPageWithClampedLayout(
          {
            ...page,
            widgetInstances: page.widgetInstances.filter((w) => w.id !== widgetId),
          },
          lg
        ).page;
      });
    },
    [activePageId, updatePageById, addToast, focusedWidgetId]
  );

  const addWidget = useCallback(
    async (widgetType: string) => {
      if (!activePage || activePage.widgetInstances.length >= MAX_WIDGETS_PER_PAGE) {
        addToast({
          type: 'warning',
          title: 'Widget limit reached',
          message: `Maximum ${MAX_WIDGETS_PER_PAGE} widgets per dashboard page.`,
        });
        return;
      }

      const widgetTypeConfig = getWidgetType(widgetType);
      if (!widgetTypeConfig) return;

      let baseId: string;
      if (widgetType.startsWith('stats-')) {
        baseId = widgetType.replace('stats-', '').replace('-', '') + '_stats';
      } else {
        baseId = widgetType;
      }
      let newId = baseId;
      let counter = 1;
      while (activePage.widgetInstances.some((w) => w.id === newId)) {
        newId = `${baseId}_${counter}`;
        counter++;
      }

      const newWidget: WidgetInstance = {
        id: newId,
        type: widgetType,
        title: widgetTypeConfig.name,
        size: widgetTypeConfig.defaultSize,
        config: {},
      };

      const existing = activePage.layouts.lg as GridLayoutItem[];
      const fit = findPlacementWithDockReflow(
        existing,
        activePage.widgetInstances,
        newWidget.size,
        widgetTypeConfig.availableSizes
      );
      if (!fit) {
        addToast({
          type: 'warning',
          title: 'Dashboard full',
          message:
            'No room on this page for this widget, even at the smallest allowed size.',
        });
        return;
      }

      newWidget.size = fit.size;

      const newItem: GridLayoutItem = {
        i: newId,
        ...fit.placement,
      };
      const reflowed = reflowDockLayout(
        [...existing, newItem],
        [...activePage.widgetInstances, newWidget]
      );

      updatePageById(activePageId, (page) =>
        syncPageWithClampedLayout(
          {
            ...page,
            widgetInstances: [...page.widgetInstances, newWidget],
          },
          reflowed
        ).page
      );
    },
    [activePage, activePageId, updatePageById, addToast]
  );

  return {
    pages,
    activePage,
    activePageIndex,
    activePageId,
    slideDirection,
    isLoading,
    focusedWidgetId,
    setActivePage,
    addPage,
    removePage,
    setPageName,
    handleLayoutChange,
    handleLayoutSave,
    handleLayoutChangeForPage,
    handleLayoutSaveForPage,
    handleGridResizeForPage,
    clearPreviewResizeForPage,
    getWidgetDisplaySizeForPage,
    handleGridResizeStopForPage,
    computeLiveDockRectsForPage,
    computeLiveDockGestureForPage,
    validateLivePlacementForPage,
    updateWidgetSize,
    removeWidget,
    addWidget,
    enterFullscreen,
    exitFullscreen,
    maxWidgetsPerPage: MAX_WIDGETS_PER_PAGE,
    replaceFromApiResponse,
    flushSave,
    layoutSource,
    canEditLayout,
    allowMultiplePages,
    assignedDashboardName,
    assignedDashboardId,
    hasAssignedOverride,
    resetPersonalLayout,
    tryApplyRemoteLayout,
  };
}
