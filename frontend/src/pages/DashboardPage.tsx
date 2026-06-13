import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { isDockSize } from '@/utils/dashboard-layout-engine';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { getScopedFacilityId } from '@/utils/globalFacilityScope.utils';
import { UserRole } from '@/types/auth.types';
import type { DashboardLayoutApiResponse } from '@/types/widget-management.types';
import { websocketService } from '@/services/websocket.service';
import { DashboardLiveStatus } from '@/components/Dashboard/DashboardLiveStatus';
import { DashboardSettingsModal } from '@/components/Dashboard/DashboardSettingsModal';
import { AddUserModal } from '@/components/UserManagement/AddUserModal';
import { DashboardCanvas } from '@/components/Dashboard/DashboardCanvas';
import {
  DashboardPageStrip,
  DashboardPageStripPanel,
} from '@/components/Dashboard/DashboardPageStrip';
import type { DashboardPageState } from '@/types/widget-management.types';
import { WidgetSize } from '@/types/widget.types';
import {
  DashboardPageNavigator,
} from '@/components/Dashboard/DashboardPageNavigator';
import { DashboardWidgetRenderer } from '@/components/Dashboard/DashboardWidgetRenderer';
import { FullscreenWidgetView } from '@/components/Dashboard/FullscreenWidgetView';
import { useGeneralStatsData } from '@/hooks/useGeneralStatsData';
import { useDashboardState } from '@/hooks/useDashboardState';
import { useSavedDashboards } from '@/hooks/useSavedDashboards';
import { widgetSubscriptionManager } from '@/services/widget-subscription-manager';
import { MAX_DASHBOARD_PAGES } from '@/types/widget-management.types';
import { 
  Cog6ToothIcon,
  UserPlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export default function DashboardPage() {
  const { authState, isAdmin, canManageUsers } = useAuth();
  const { selectedFacilityId } = useGlobalFacility();
  const effectiveFacilityId = getScopedFacilityId(selectedFacilityId);
  const isTenant = authState.user?.role === UserRole.TENANT;

  const { stats: generalStats, loading: statsLoading, error: statsError, canAccess, getHandlers } =
    useGeneralStatsData();

  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [savedTabActive, setSavedTabActive] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);

  const {
    pages,
    activePage,
    activePageIndex,
    isLoading,
    focusedWidgetId,
    setActivePage,
    addPage,
    handleLayoutChangeForPage,
    computeLiveDockGestureForPage,
    handleLayoutSaveForPage,
    handleGridResizeForPage,
    clearPreviewResizeForPage,
    getWidgetDisplaySizeForPage,
    updateWidgetSize,
    removeWidget,
    addWidget,
    removePage,
    setPageName,
    enterFullscreen,
    exitFullscreen,
    maxWidgetsPerPage,
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
  } = useDashboardState({
    isAuthenticated: authState.isAuthenticated,
    isTenant,
    activeFacilityId: selectedFacilityId,
  });

  const focusedWidget = useMemo(() => {
    if (!focusedWidgetId) return null;
    for (const page of pages) {
      const match = page.widgetInstances.find((w) => w.id === focusedWidgetId);
      if (match) return match;
    }
    return null;
  }, [pages, focusedWidgetId]);

  const handleFullscreenToggle = (widgetId: string) => {
    if (focusedWidgetId === widgetId) {
      exitFullscreen();
    } else {
      enterFullscreen(widgetId);
    }
  };

  const savedDashboards = useSavedDashboards({
    enabled: showAddWidgetModal && canEditLayout && savedTabActive,
    onBeforeSave: flushSave,
    onLoaded: (response) => {
      replaceFromApiResponse(response, { ignoreStoredFocus: true });
    },
  });

  const handleAddPage = async () => {
    const newIndex = await addPage();
    if (newIndex != null) setEditingPageIndex(newIndex);
  };

  const handlePageNameCommit = (index: number, name: string) => {
    setPageName(index, name);
    setEditingPageIndex(null);
  };

  const wsFacilityFilters = useMemo(
    () => ({
      activeFacilityId: effectiveFacilityId ?? ALL_FACILITIES_ID,
    }),
    [effectiveFacilityId]
  );

  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const handler = (data: unknown) => {
      tryApplyRemoteLayout(data as DashboardLayoutApiResponse);
    };
    const unsubMessage = websocketService.onMessage('dashboard_layout', handler);
    websocketService.subscribe('dashboard_layout', wsFacilityFilters);
    return () => {
      websocketService.unsubscribe('dashboard_layout', wsFacilityFilters);
      unsubMessage();
    };
  }, [authState.isAuthenticated, tryApplyRemoteLayout, wsFacilityFilters]);

  useEffect(() => {
    if (!canAccess) {
      widgetSubscriptionManager.unsubscribe('general_stats');
      return;
    }

    const instances = pages.flatMap((p) => p.widgetInstances);
    const statsWidgetTypes = ['stats-facilities', 'stats-devices', 'stats-users', 'stats-alerts'];

    const subscriptions: string[] = [];
    const subscriptionMap: Record<
      string,
      { handler: (data: unknown) => void; errorHandler?: (error: string) => void }
    > = {};

    if (instances.some((w) => statsWidgetTypes.includes(w.type))) {
      subscriptions.push('general_stats');
      const { onData, onError } = getHandlers();
      subscriptionMap['general_stats'] = {
        handler: (data: unknown) => onData(data as Parameters<typeof onData>[0]),
        errorHandler: onError,
      };
    } else {
      widgetSubscriptionManager.unsubscribe('general_stats');
    }

    if (subscriptions.length > 0) {
      widgetSubscriptionManager.updateSubscriptions(subscriptions, subscriptionMap);
    }

    return () => {
      widgetSubscriptionManager.unsubscribeAll();
    };
  }, [pages, canAccess, getHandlers]);

  const handleDashboardRefresh = () => {
    window.location.reload();
  };

  const getWelcomeMessage = (): string => {
    const role = authState.user?.role;
    switch (role) {
      case UserRole.DEV_ADMIN:
        return 'Welcome to the development admin dashboard. You have full system access.';
      case UserRole.ADMIN:
        return 'Welcome to the admin dashboard. Manage your facilities and users.';
      case UserRole.BLULOK_TECHNICIAN:
        return 'Welcome to the technician dashboard. Monitor and maintain BluLok devices.';
      case UserRole.MAINTENANCE:
        return 'Welcome to the maintenance dashboard. Track and schedule maintenance tasks.';
      case UserRole.TENANT:
        return 'Welcome to your tenant dashboard. Monitor your storage facilities.';
      default:
        return 'Welcome to BluLok Cloud.';
    }
  };

  const staticWidgetIdsByPage = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const page of pages) {
      const ids = new Set<string>();
      for (const w of page.widgetInstances) {
        if (isDockSize(w.size)) ids.add(w.id);
      }
      map.set(page.id, ids);
    }
    return map;
  }, [pages]);

  const renderPagePanel = (page: DashboardPageState, pageIndex: number) => {
    const isActivePage = pageIndex === activePageIndex;
    const staticWidgetIds = staticWidgetIdsByPage.get(page.id) ?? new Set<string>();
    const displaySizeForWidget = getWidgetDisplaySizeForPage(page.id);

    return (
      <DashboardPageStripPanel
        key={page.id}
        pageCount={pageCount}
        pageIndex={pageIndex}
        isActive={isActivePage}
      >
        {page.layouts.lg.length > 0 ? (
          <DashboardCanvas
            layouts={page.layouts}
            staticWidgetIds={staticWidgetIds}
            onLayoutChange={handleLayoutChangeForPage(page.id)}
            onLayoutSave={handleLayoutSaveForPage(page.id)}
            onResize={handleGridResizeForPage(page.id)}
            onResizeGestureEnd={() => clearPreviewResizeForPage(page.id)}
            computeLiveDockGesture={computeLiveDockGestureForPage(page.id)}
            isDraggable={canEditLayout && isActivePage}
            isResizable={canEditLayout && isActivePage}
          >
            {page.widgetInstances.map((widget) => {
              const hidden = isActivePage && focusedWidgetId === widget.id;
              const layoutItem = page.layouts.lg.find((l) => l.i === widget.id);
              const gridSize = layoutItem
                ? { w: layoutItem.w, h: layoutItem.h }
                : undefined;
              return (
                <motion.div
                  key={widget.id}
                  data-widget-id={widget.id}
                  className={`h-full min-h-0${hidden ? ' invisible pointer-events-none' : ''}`}
                  aria-hidden={hidden}
                >
                  {hidden ? (
                    <div className="h-full w-full rounded-xl bg-gray-100/60 dark:bg-gray-800/40" />
                  ) : (
                    <DashboardWidgetRenderer
                      widget={widget}
                      displaySize={displaySizeForWidget(
                        widget.id,
                        widget.size as WidgetSize
                      )}
                      isTenant={isTenant}
                      canEditLayout={canEditLayout}
                      isPageActive={isActivePage}
                      effectiveFacilityId={effectiveFacilityId}
                      generalStats={generalStats}
                      statsLoading={statsLoading}
                      statsError={statsError}
                      onSizeChange={updateWidgetSize}
                      onRemove={removeWidget}
                      onFullscreenToggle={handleFullscreenToggle}
                      isFullscreen={false}
                      gridSize={gridSize}
                    />
                  )}
                </motion.div>
              );
            })}
          </DashboardCanvas>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            {allowMultiplePages
              ? 'Empty dashboard — add widgets from the settings button.'
              : 'No widgets on this dashboard.'}
          </div>
        )}
      </DashboardPageStripPanel>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  const widgetCount = activePage?.widgetInstances.length ?? 0;
  const pageCount = pages.length;

  const pageCanvas = (
    <DashboardPageStrip pageCount={pageCount} activeIndex={activePageIndex}>
      {pages.map((page, index) => renderPagePanel(page, index))}
    </DashboardPageStrip>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome back, {authState.user?.firstName}!
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {getWelcomeMessage()}
            </p>
            {layoutSource === 'assigned' && !canEditLayout && (
              <p className="mt-2 text-xs text-[#147FD4] dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg px-3 py-1.5 inline-block">
                Dashboard managed by your organization
                {assignedDashboardName ? ` · ${assignedDashboardName}` : ''}
              </p>
            )}
            {layoutSource === 'personal' && hasAssignedOverride && canEditLayout && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5"
              >
                <span>
                  Personal layout active
                  {assignedDashboardName ? ` · assigned: ${assignedDashboardName}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => void resetPersonalLayout()}
                  className="font-medium text-[#147FD4] dark:text-primary-300 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                >
                  Revert to assigned
                </button>
              </motion.div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <DashboardLiveStatus />
            <button
              onClick={handleDashboardRefresh}
              className="group relative p-2.5 rounded-lg transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 hover:shadow-sm"
              title="Refresh all dashboard data"
            >
              <ArrowPathIcon className="h-5 w-5 transition-transform duration-200 group-hover:rotate-180" />
            </button>
            
            {!isTenant && canManageUsers() && (
              <button
                onClick={() => setShowAddUserModal(true)}
                className="group relative p-2.5 rounded-lg transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 hover:shadow-sm"
                title="Add new user"
              >
                <UserPlusIcon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              </button>
            )}

            {canEditLayout && (
              <button
                onClick={() => setShowAddWidgetModal(true)}
                disabled={widgetCount >= maxWidgetsPerPage}
                className={`group relative p-2.5 rounded-lg transition-all duration-200 ${
                  widgetCount >= maxWidgetsPerPage
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 hover:shadow-sm'
                }`}
                title={
                  widgetCount >= maxWidgetsPerPage
                    ? 'Maximum widgets reached'
                    : 'Dashboard settings'
                }
              >
                <Cog6ToothIcon
                  className={`h-5 w-5 transition-transform duration-200 ${
                    widgetCount >= maxWidgetsPerPage ? '' : 'group-hover:rotate-90'
                  }`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col min-w-0">
        <div className="relative flex-1 min-h-0 overflow-hidden">{pageCanvas}</div>

        <FullscreenWidgetView
          isOpen={!!focusedWidgetId}
          widgetTitle={focusedWidget?.title}
          onExit={exitFullscreen}
        >
          {focusedWidgetId && focusedWidget && (
            <DashboardWidgetRenderer
              widget={focusedWidget}
              isTenant={isTenant}
              canEditLayout={canEditLayout}
              isPageActive
              effectiveFacilityId={effectiveFacilityId}
              generalStats={generalStats}
              statsLoading={statsLoading}
              statsError={statsError}
              onSizeChange={updateWidgetSize}
              onRemove={removeWidget}
              onFullscreenToggle={handleFullscreenToggle}
              isFullscreen
            />
          )}
        </FullscreenWidgetView>
          </div>

      {pageCount > 1 && !focusedWidgetId && (
        <DashboardPageNavigator
          pageCount={pages.length}
          activeIndex={activePageIndex}
          pageNames={pages.map((p) => p.name)}
          onSelectPage={(i) => setActivePage(i, i > activePageIndex ? 1 : -1)}
          onPrev={() => setActivePage(activePageIndex - 1, -1)}
          onNext={() => setActivePage(activePageIndex + 1, 1)}
        />
      )}

      <DashboardSettingsModal
        isOpen={showAddWidgetModal}
        onClose={() => {
          setShowAddWidgetModal(false);
          setEditingPageIndex(null);
        }}
        onAddWidget={addWidget}
        existingWidgets={activePage?.widgetInstances.map((w) => w.type) ?? []}
        maxWidgets={maxWidgetsPerPage}
        role={authState.user?.role}
        allowPageManagement={canEditLayout}
        showSavedTab={isAdmin()}
        pageNames={pages.map((p) => p.name)}
        pageIds={pages.map((p) => p.id)}
        activePageIndex={activePageIndex}
        maxPages={MAX_DASHBOARD_PAGES}
        onAddPage={handleAddPage}
        onPageNameCommit={handlePageNameCommit}
        onRemovePage={removePage}
        editingPageIndex={editingPageIndex}
        onStartRename={setEditingPageIndex}
        onCancelRename={() => setEditingPageIndex(null)}
        savedDashboards={savedDashboards.dashboards}
        savedDashboardsLoading={savedDashboards.isLoading}
        savedDashboardsError={savedDashboards.error}
        savedDashboardsSaving={savedDashboards.isSaving}
        savedDashboardActionId={savedDashboards.actionId}
        onRefreshSavedDashboards={() => void savedDashboards.refresh()}
        onSaveCurrentDashboard={savedDashboards.saveCurrent}
        onUpdateExistingDashboard={savedDashboards.updateExisting}
        suggestedUpdateTemplateId={assignedDashboardId}
        onLoadSavedDashboard={async (id: string) => {
          const ok = await savedDashboards.loadDashboard(id);
          if (ok) {
            setShowAddWidgetModal(false);
            setEditingPageIndex(null);
          }
          return ok;
        }}
        onRenameSavedDashboard={savedDashboards.renameDashboard}
        onDeleteSavedDashboard={savedDashboards.deleteDashboard}
        onSavedTabActive={setSavedTabActive}
      />

      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        defaultSendInviteWhenSkippingPassword
        onSuccess={() => setShowAddUserModal(false)}
      />
    </div>
  );
}
