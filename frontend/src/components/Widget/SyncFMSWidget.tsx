import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ServerIcon,
  CloudIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { fmsService } from '@/services/fms.service';
import { apiService } from '@/services/api.service';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { FMSSyncLog } from '@/types/fms.types';
import {
  getFmsSyncHistoryChangesLabel,
  getFmsSyncHistoryRowClassName,
  getFmsSyncHistoryTypeBadgeClassName,
  getFmsSyncLogTypeLabel,
  isFmsWebhookPushLog,
} from '@/utils/fmsSyncLogDisplay';
import { isFMSSyncInProgressError } from '@/utils/fms-sync.utils';
import { formatFmsApplyFailureToast } from '@/utils/fms-apply-error-display.utils';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { usePressWithoutDrag } from '@/hooks/usePressWithoutDrag';
import { DashboardFacilityScopePlaceholder } from '@/components/Widget/DashboardFacilityScopePlaceholder';
import { DASHBOARD_SELECT_FACILITY_TITLE } from '@/constants/dashboard-facility-scope.constants';
import { StatTinyContent } from '@/components/Widget/widget-content.utils';
import { formatDateTime, formatRelativeTime } from '@/utils/datetime.utils';
import { formatPendingReviewLabel } from '@/utils/fms-pending-review.utils';

const FMS_SYNC_TINT_ACTIVE =
  'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20';
const FMS_SYNC_TINT_INACTIVE =
  'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/80';

function fmsSyncTintClass(enabled: boolean): string {
  return enabled ? FMS_SYNC_TINT_ACTIVE : FMS_SYNC_TINT_INACTIVE;
}

function fmsSyncActionClass(enabled: boolean): string {
  return `${fmsSyncTintClass(enabled)} transition-opacity hover:opacity-90`;
}

function FmsSyncActionButton({
  enabled,
  syncing = false,
  disabled = false,
  onClick,
  title,
  className = '',
  iconClassName = 'h-5 w-5',
  children,
}: {
  enabled: boolean;
  syncing?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
  iconClassName?: string;
  children?: React.ReactNode;
}) {
  const { pressProps } = usePressWithoutDrag(onClick, { disabled });

  return (
    <div
      {...pressProps}
      title={title}
      className={`no-drag pointer-events-auto flex items-center justify-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${fmsSyncActionClass(enabled)} ${className}`}
    >
      <ArrowPathIcon className={`${iconClassName} ${syncing ? 'animate-spin' : ''}`} />
      {children}
    </div>
  );
}

interface FMSSyncStatus {
  facilityId: string;
  facilityName?: string;
  lastSyncTime: string | null;
  status: 'completed' | 'failed' | 'partial' | 'pending_review' | 'never_synced' | 'not_configured';
  changesDetected?: number;
  changesApplied?: number;
  changesPending?: number;
  pendingSyncLogId?: string;
  pendingTriggeredBy?: 'manual' | 'automatic' | 'webhook';
  errorMessage?: string;
}

interface FMSSyncStatusData {
  facilities: FMSSyncStatus[];
  lastUpdated: string;
  updatedFacilityId?: string;
}

interface SyncFMSWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  /** When false (dashboard page strip), sync actions are disabled on off-screen pages. */
  isPageActive?: boolean;
}

export const SyncFMSWidget: React.FC<SyncFMSWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  currentSize,
  availableSizes = ['tiny', 'small', 'medium', 'large', 'large-wide', 'huge'],
  onSizeChange,
  onGridSizeChange,
  onRemove,
  readOnly,
  isPageActive = true,
}) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const { startSync, completeSync, canStartNewSync, cancelSync, hasCompletedSync, openPendingReview } = useFMSSync();
  const { selectedFacilityId, facilities, isLoading: facilitiesLoading } = useGlobalFacility();
  const { size, handleSizeChange } = useWidgetSizeState(
    currentSize,
    initialSize,
    onSizeChange
  );
  
  // FMS state
  const [fmsStatuses, setFmsStatuses] = useState<FMSSyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  
  // Sync history
  const [syncHistory, setSyncHistory] = useState<FMSSyncLog[]>([]);


  const [facilityNamesMap, setFacilityNamesMap] = useState<Record<string, string>>({});
  const manualSyncInFlightRef = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingTimeout = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!authState.user) return;
    loadingTimeoutRef.current = setTimeout(() => {
      setLoading(false);
    }, 5000);
    return () => {
      clearLoadingTimeout();
    };
  }, [authState.user]);

  useWebSocketSubscription(
    'fms_sync_status',
    (data) => {
      clearLoadingTimeout();
      setFmsStatuses((data as FMSSyncStatusData).facilities);
      setLoading(false);
    },
    {
      enabled: Boolean(authState.user),
      onError: () => {
        clearLoadingTimeout();
        setLoading(false);
      },
    },
  );

  // Get user's facilities
  const isAdminUser = authState.user?.role === 'admin' || authState.user?.role === 'dev_admin';
  
  // Fetch all facilities for admin users (for name fallbacks in WS payloads)
  useEffect(() => {
    if (!isAdminUser) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await apiService.getFacilities();
        if (cancelled) return;
        if (data?.success && Array.isArray(data.facilities)) {
          const namesMap: Record<string, string> = {};
          data.facilities.forEach((facility: { id: string; name: string }) => {
            namesMap[facility.id] = facility.name;
          });
          setFacilityNamesMap(namesMap);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch facilities:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdminUser]);

  // Stable list of facility IDs the user can access (for effects / FMS scope)
  const userFacilityIds = useMemo(() => facilities.map((f) => f.id), [facilities]);
  const userFacilityIdsKey = useMemo(
    () => [...userFacilityIds].sort().join(','),
    [userFacilityIds]
  );
  const restStatusProbeKeyRef = useRef<string | null>(null);

  // Create a mapping of facility ID to name
  const getFacilityName = (facilityId: string) => {
    // First try to find in global context facilities
    const globalFacility = facilities.find(f => f.id === facilityId);
    if (globalFacility) {
      return globalFacility.name;
    }

    // Fall back to WebSocket data facility name
    const wsFacility = fmsStatuses.find(s => s.facilityId === facilityId);
    if (wsFacility?.facilityName) {
      return wsFacility.facilityName;
    }

    // Fall back to facility names map (for admin users)
    if (isAdminUser && facilityNamesMap[facilityId]) {
      return facilityNamesMap[facilityId];
    }

    // Last resort: return the ID
    return facilityId;
  };

  // Check if a facility has FMS configured
  const hasFMSConfigured = (facilityId: string) => {
    const status = fmsStatuses.find(s => s.facilityId === facilityId);
    // FMS is configured if we have a status that's not "not_configured"
    return status && status.status !== 'not_configured';
  };

  /**
   * Any facility with FMS enabled (not "not_configured").
   * When the global facility list is still empty (loading), trust the WebSocket feed alone — it is
   * already scoped server-side for facility admins. Previously we required an intersection with
   * `facilities`, which stayed [] until after the WS timeout and produced a false "no FMS" state.
   */
  const hasAnyFMSConfigured = useMemo(() => {
    const scoped = userFacilityIds.length > 0;
    return fmsStatuses.some((s) => {
      if (s.status === 'not_configured') return false;
      if (!scoped) return true;
      return userFacilityIds.includes(s.facilityId);
    });
  }, [fmsStatuses, userFacilityIds]);

  // If WebSocket never shows enabled FMS for the user's facilities, confirm via REST (WS down, etc.)
  useEffect(() => {
    if (!authState.user || loading || facilitiesLoading || userFacilityIds.length === 0) {
      if (userFacilityIds.length === 0) {
        restStatusProbeKeyRef.current = null;
      }
      return;
    }

    const anyPositiveForUser = userFacilityIds.some((id) => {
      const st = fmsStatuses.find((s) => s.facilityId === id);
      return st && st.status !== 'not_configured';
    });
    if (anyPositiveForUser) return;

    if (restStatusProbeKeyRef.current === userFacilityIdsKey) return;
    restStatusProbeKeyRef.current = userFacilityIdsKey;

    let cancelled = false;
    (async () => {
      try {
        const updates: FMSSyncStatus[] = [];
        for (const facilityId of userFacilityIds) {
          const cfg = await fmsService.getConfig(facilityId);
          if (cancelled) return;
          if (cfg?.is_enabled) {
            const name = facilities.find((f) => f.id === facilityId)?.name;
            updates.push({
              facilityId,
              ...(name ? { facilityName: name } : {}),
              lastSyncTime: null,
              status: 'never_synced',
            });
          }
        }
        if (cancelled || updates.length === 0) return;
        setFmsStatuses((prev) => {
          const next = [...prev];
          for (const u of updates) {
            const i = next.findIndex((s) => s.facilityId === u.facilityId);
            if (i >= 0) {
              if (next[i].status === 'not_configured') {
                next[i] = { ...next[i], ...u };
              }
            } else {
              next.push(u);
            }
          }
          return next;
        });
      } catch (e) {
        console.error('[SyncFMSWidget] REST FMS status probe failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authState.user,
    loading,
    facilitiesLoading,
    userFacilityIds,
    userFacilityIdsKey,
    fmsStatuses,
    facilities,
  ]);

  // Find facility with oldest sync time for tiny view
  const getOldestSyncFacility = () => {
    if (!hasAnyFMSConfigured) return null;

    let oldestFacility = null;
    let oldestTime = new Date();

    for (const facilityId of userFacilityIds) {
      const status = fmsStatuses.find(s => s.facilityId === facilityId);
      if (status && hasFMSConfigured(facilityId) && status.lastSyncTime) {
        const syncTime = new Date(status.lastSyncTime);
        if (syncTime < oldestTime) {
          oldestTime = syncTime;
          oldestFacility = facilityId;
        }
      }
    }

    return oldestFacility;
  };

  const oldestSyncFacilityId = getOldestSyncFacility();
  const oldestSyncStatus = oldestSyncFacilityId ? fmsStatuses.find(s => s.facilityId === oldestSyncFacilityId) : null;


  // Use global context facility - no need to initialize

  // Get current facility's status from WebSocket data
  // Only show status if a specific facility is selected (not "All Facilities")
  const effectiveFacilityId = selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID ? selectedFacilityId : null;
  const currentFacilityStatus = effectiveFacilityId ? fmsStatuses.find(s => s.facilityId === effectiveFacilityId) : null;
  // FMS is configured if we have a status for this facility that's not 'not_configured'
  const fmsConfigured = Boolean(
    effectiveFacilityId && hasFMSConfigured(effectiveFacilityId)
  );

  const showBlockingSpinner =
    loading || (!!authState.user && facilitiesLoading && userFacilityIds.length === 0);

  const syncActionDisabled =
    !isPageActive || syncing || showBlockingSpinner || !fmsConfigured;

  // Load sync history when facility changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!effectiveFacilityId) return;

      // If FMS is not configured, don't try to load history
      if (!fmsConfigured && !loading && !facilitiesLoading) {
        setSyncHistory([]);
        return;
      }

      try {
        const history = await fmsService.getSyncHistory(effectiveFacilityId, { limit: 5 });
        setSyncHistory(history.logs);
      } catch (error: any) {
        console.error('Failed to load sync history:', error);
        // If we get a 404, it means FMS is not configured
        if (error.response?.status === 404) {
          setSyncHistory([]);
        }
      }
    };

    loadHistory();
  }, [effectiveFacilityId, fmsConfigured, loading, facilitiesLoading]);

  const handleManualSync = async () => {
    if (!isPageActive) {
      return;
    }

    if (manualSyncInFlightRef.current) {
      return;
    }

    if (!effectiveFacilityId) {
      addToast({
        type: 'error',
        title: 'No Facility Selected',
        message: 'Please select a specific facility to sync',
      });
      return;
    }

    // Prevent starting new sync if one is already active
    if (!canStartNewSync()) {
      addToast({
        type: 'warning',
        title: 'Sync Already in Progress',
        message: 'Please wait for the current sync to complete',
      });
      return;
    }

    try {
      manualSyncInFlightRef.current = true;
      setSyncing(true);

      const facilityName = getFacilityName(effectiveFacilityId);
      if (!startSync(effectiveFacilityId, facilityName)) {
        return;
      }

      const result = await fmsService.triggerSync(effectiveFacilityId);

      if (!hasCompletedSync()) {
        if (result.changesDetected && result.changesDetected.length > 0) {
          completeSync(result.changesDetected, result);
        } else {
          completeSync([], result);
        }
      }

      if (result.changesDetected && result.changesDetected.length > 0) {
        if (autoApprove) {
          // Auto-approve all changes
          const changeIds = result.changesDetected.map(c => c.id);
          const applyResult = await fmsService.applyChanges(result.syncLogId, changeIds);

          if (
            applyResult.changesFailed > 0 ||
            applyResult.errors.length > 0 ||
            (applyResult.errorDetails?.length ?? 0) > 0
          ) {
            const failureToast = formatFmsApplyFailureToast(
              applyResult,
              changeIds.length,
              result.changesDetected,
            );
            addToast({
              type: failureToast.toastType,
              title: failureToast.title,
              message: failureToast.message,
              duration: 12000,
            });
          } else {
            const details: string[] = [];
            if (applyResult.accessChanges.usersCreated.length > 0) {
              details.push(`${applyResult.accessChanges.usersCreated.length} user${applyResult.accessChanges.usersCreated.length !== 1 ? 's' : ''} created`);
            }
            if (applyResult.accessChanges.usersDeactivated.length > 0) {
              details.push(`${applyResult.accessChanges.usersDeactivated.length} user${applyResult.accessChanges.usersDeactivated.length !== 1 ? 's' : ''} deactivated`);
            }
            if (applyResult.accessChanges.accessGranted.length > 0) {
              details.push(`${applyResult.accessChanges.accessGranted.length} unit access granted`);
            }
            if (applyResult.accessChanges.accessRevoked.length > 0) {
              details.push(`${applyResult.accessChanges.accessRevoked.length} unit access revoked`);
            }

            addToast({
              type: 'success',
              title: 'Changes Applied Automatically',
              message: details.length > 0
                ? details.join(', ')
                : `${applyResult.changesApplied} changes applied successfully`,
              duration: 6000,
            });
          }
        }
        // Note: Review modal will be shown when user clicks the status bar, not automatically
      } else {
        addToast({
          type: 'success',
          title: 'Sync Complete',
          message: 'No changes detected',
        });
      }

      // Refresh history
      if (effectiveFacilityId) {
        const history = await fmsService.getSyncHistory(effectiveFacilityId, { limit: 5 });
        setSyncHistory(history.logs);
      }
    } catch (error: any) {
      if (isFMSSyncInProgressError(error)) {
        return;
      }
      cancelSync();
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync with FMS',
      });
    } finally {
      manualSyncInFlightRef.current = false;
      setSyncing(false);
    }
  };


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      case 'partial':
      case 'pending_review':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ServerIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  /** Full panel class names (Tailwind) — do not use as inline CSS */
  const getStatusPanelClassName = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800';
      case 'failed':
        return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
      case 'partial':
      case 'pending_review':
        return 'text-yellow-800 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800';
      case 'never_synced':
        return 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600';
      default:
        return 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600';
    }
  };

  const pendingReviewLabel = (status: FMSSyncStatus): string | null => {
    if (!status.changesPending || status.changesPending <= 0 || !status.pendingSyncLogId) {
      return null;
    }
    return formatPendingReviewLabel(status.changesPending, status.pendingTriggeredBy);
  };

  const handleOpenPendingReview = async (status: FMSSyncStatus) => {
    if (!status.pendingSyncLogId || !effectiveFacilityId) return;
    try {
      await openPendingReview(
        effectiveFacilityId,
        status.pendingSyncLogId,
        getFacilityName(effectiveFacilityId),
      );
    } catch (err) {
      console.error('Failed to open pending review:', err);
      addToast({
        type: 'error',
        title: 'Could not open review',
        message: err instanceof Error ? err.message : 'Please try again',
      });
    }
  };

  if (showBlockingSpinner && size !== 'tiny') {
    return (
      <Widget
        id={id}
        title={title}
        size={size}
        availableSizes={availableSizes}
        onSizeChange={handleSizeChange}
        onGridSizeChange={onGridSizeChange}
        onRemove={onRemove}
        readOnly={readOnly}
      >
        <div className="flex items-center justify-center h-full min-h-0">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" aria-label="Loading" />
        </div>
      </Widget>
    );
  }

  if (size === 'tiny') {
    const canSync = Boolean(effectiveFacilityId && fmsConfigured);
    return (
      <Widget
        id={id}
        title={title}
        size={size}
        availableSizes={availableSizes}
        onSizeChange={handleSizeChange}
        onGridSizeChange={onGridSizeChange}
        onRemove={onRemove}
        readOnly={readOnly}
        suppressTitleOverlay
      >
        <StatTinyContent
          loading={showBlockingSpinner}
          icon={canSync ? ArrowPathIcon : CloudIcon}
          value={
            syncing
              ? '…'
              : !effectiveFacilityId || !fmsConfigured
                ? '—'
                : (currentFacilityStatus?.lastSyncTime ?? oldestSyncStatus?.lastSyncTime)
                  ? formatRelativeTime(
                      (currentFacilityStatus?.lastSyncTime ??
                        oldestSyncStatus?.lastSyncTime) as string
                    )
                  : 'Sync'
          }
          label={title}
          iconClassName={fmsSyncTintClass(canSync)}
          onClick={effectiveFacilityId ? handleManualSync : undefined}
          disabled={syncing || !canSync || !isPageActive}
          spinning={syncing}
          actionTitle={
            !effectiveFacilityId
              ? 'Select a facility to sync'
              : !fmsConfigured
                ? 'FMS not configured for this facility'
                : 'Sync now'
          }
        />
      </Widget>
    );
  }

  return (
    <>
      <Widget
        id={id}
        title={title}
        size={size}
        availableSizes={availableSizes}
        onSizeChange={handleSizeChange}
        onGridSizeChange={onGridSizeChange}
        onRemove={onRemove}
        readOnly={readOnly}
        enhancedMenu={
          fmsConfigured ? (
            <div className="space-y-1">
              <button
                onClick={() => setAutoApprove(!autoApprove)}
                className={`w-full px-3 py-2 text-left text-sm rounded ${
                  autoApprove
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {autoApprove ? '✓ ' : ''}Auto-approve changes
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="h-full min-h-0 flex flex-col space-y-3 overflow-hidden">
          {selectedFacilityId === ALL_FACILITIES_ID ? (
            <DashboardFacilityScopePlaceholder
              icon={ArrowPathIcon}
              title={DASHBOARD_SELECT_FACILITY_TITLE}
              message="Choose a facility from the header to view FMS sync status and run manual syncs."
            />
          ) : (
            <>
          {currentFacilityStatus && pendingReviewLabel(currentFacilityStatus) && (
            <button
              type="button"
              onClick={() => void handleOpenPendingReview(currentFacilityStatus)}
              className="w-full rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
            >
              {pendingReviewLabel(currentFacilityStatus)}
              <span className="ml-1 text-amber-700 dark:text-amber-300">→ Review</span>
            </button>
          )}
          {size === 'small' && !effectiveFacilityId && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">
              Select a facility to sync
            </p>
          )}
          {/* Small: single compact row — only when this facility has FMS (avoid stacking with empty-state blocks) */}
          {size === 'small' && effectiveFacilityId && hasAnyFMSConfigured && fmsConfigured && (
            <div className="flex min-h-0 flex-1 shrink-0 items-center justify-center gap-2 overflow-hidden px-1 py-0">
              <FmsSyncActionButton
                enabled={fmsConfigured}
                syncing={syncing}
                disabled={syncActionDisabled}
                onClick={handleManualSync}
                title={!fmsConfigured ? 'FMS not configured for this facility' : 'Sync now'}
                className="shrink-0 rounded-lg p-2 text-sm font-medium"
                iconClassName="h-4 w-4"
              />
              <div className="min-w-0 flex-1 text-left">
                {currentFacilityStatus ? (
                  <>
                    <div className="truncate text-xs font-medium text-gray-900 dark:text-white">
                      {currentFacilityStatus.status === 'completed'
                        ? 'Synced'
                        : currentFacilityStatus.status === 'failed'
                          ? 'Failed'
                          : currentFacilityStatus.status === 'never_synced'
                            ? 'Never sync'
                            : currentFacilityStatus.status === 'pending_review'
                              ? 'Review needed'
                              : 'Partial'}
                    </div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {currentFacilityStatus.lastSyncTime
                        ? formatRelativeTime(currentFacilityStatus.lastSyncTime)
                        : 'No history'}
                    </div>
                  </>
                ) : (
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {oldestSyncStatus?.lastSyncTime
                      ? formatRelativeTime(oldestSyncStatus.lastSyncTime)
                      : 'Waiting for status…'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FMS Not Configured Messages */}
          {!hasAnyFMSConfigured && !loading && !facilitiesLoading && (
            <div className={`flex-1 flex flex-col items-center justify-center text-center ${size === 'small' ? 'p-2' : 'p-4'}`}>
              <CloudIcon className={`${size === 'small' ? 'h-8 w-8' : 'h-12 w-12'} text-gray-400 dark:text-gray-600 mb-2`} />
              <p className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 mb-1`}>
                No Facilities have an FMS setup
              </p>
              {size !== 'small' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure FMS integration in Facility Details
                </p>
              )}
            </div>
          )}

          {/* Show individual facility message only when some facilities have FMS but current one doesn't */}
          {effectiveFacilityId && hasAnyFMSConfigured && !fmsConfigured && !loading && !facilitiesLoading && (
            <div className={`flex-1 flex flex-col items-center justify-center text-center ${size === 'small' ? 'p-2' : 'p-4'}`}>
              <CloudIcon className={`${size === 'small' ? 'h-8 w-8' : 'h-12 w-12'} text-gray-400 dark:text-gray-600 mb-2`} />
              <p className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 mb-1`}>
                FMS Not Configured
              </p>
              {size !== 'small' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure FMS integration in Facility Details
                </p>
              )}
            </div>
          )}


          {/* Medium size horizontal layout with sync button */}
          {size === 'medium' && effectiveFacilityId && currentFacilityStatus && (
            <div className="flex items-center space-x-3 h-full">
              {/* Last sync status - takes 66% of width */}
              <div className={`flex-1 min-w-0 p-3 rounded-lg ${getStatusPanelClassName(currentFacilityStatus.status)}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(currentFacilityStatus.status)}
                    <span className="text-sm font-medium">
                      {currentFacilityStatus.status === 'completed' ? 'Last Sync Successful' :
                       currentFacilityStatus.status === 'failed' ? 'Last Sync Failed' :
                       currentFacilityStatus.status === 'never_synced' ? 'Never Synced' :
                       currentFacilityStatus.status === 'pending_review' ? 'Changes Pending Review' :
                       'Partial Sync'}
                    </span>
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  {currentFacilityStatus.lastSyncTime ? (
                    <>
                      <div className="font-medium">{formatRelativeTime(currentFacilityStatus.lastSyncTime)}</div>
                      {currentFacilityStatus.changesDetected !== undefined && (
                        <div>
                          {currentFacilityStatus.changesDetected} detected
                          {currentFacilityStatus.changesApplied !== undefined && currentFacilityStatus.changesApplied !== null && (
                            <span>
                              {currentFacilityStatus.changesApplied === currentFacilityStatus.changesDetected
                                ? ' • All Applied'
                                : ` • ${currentFacilityStatus.changesApplied} applied`
                              }
                            </span>
                          )}
                        </div>
                      )}
                      {currentFacilityStatus.errorMessage && (
                        <div className="text-red-600 dark:text-red-400 truncate">{currentFacilityStatus.errorMessage}</div>
                      )}
                    </>
                  ) : (
                    <div>No sync history</div>
                  )}
                </div>
              </div>

              {/* Sync button - takes remaining space */}
              {hasAnyFMSConfigured && (
                <div className="flex items-center">
                  <FmsSyncActionButton
                    enabled={fmsConfigured}
                    syncing={syncing}
                    disabled={syncActionDisabled}
                    onClick={handleManualSync}
                    title={!fmsConfigured ? 'FMS not configured for this facility' : 'Sync now'}
                    className="rounded-lg px-4 py-4"
                    iconClassName="h-5 w-5"
                  />
                </div>
              )}
            </div>
          )}

          {/* Sync History (for large widgets) */}
          {(size === 'large' || size === 'large-wide' || size === 'huge') && effectiveFacilityId && syncHistory.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col">
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex-shrink-0">Recent Syncs</h4>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-2 pr-1">
                  {syncHistory.slice(0, size === 'large' ? 8 : size === 'large-wide' ? 10 : 12).map((sync) => {
                    const webhookPush = isFmsWebhookPushLog(sync);
                    return (
                      <div key={sync.id} className={getFmsSyncHistoryRowClassName(sync)}>
                        <div className="flex min-w-0 items-center gap-2">
                          {webhookPush ? (
                            <BoltIcon className="h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
                          ) : (
                            <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">{getStatusIcon(sync.sync_status)}</span>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={getFmsSyncHistoryTypeBadgeClassName(sync)}>
                                {getFmsSyncLogTypeLabel(sync)}
                              </span>
                              <span className="truncate text-gray-700 dark:text-gray-300">
                                {formatDateTime(sync.started_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-right text-gray-500 dark:text-gray-400 ${
                            webhookPush ? 'text-[11px]' : ''
                          }`}
                        >
                          {getFmsSyncHistoryChangesLabel(sync)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Manual Sync Button for large sizes */}
          {(size === 'large' || size === 'large-wide' || size === 'huge') && effectiveFacilityId && hasAnyFMSConfigured && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <FmsSyncActionButton
                enabled={fmsConfigured}
                syncing={syncing}
                disabled={syncActionDisabled}
                onClick={handleManualSync}
                title={!fmsConfigured ? 'FMS not configured for this facility' : 'Sync now'}
                className="w-full space-x-2 py-2 px-3 text-sm font-medium rounded-lg"
                iconClassName="h-4 w-4"
              >
                <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
              </FmsSyncActionButton>
            </div>
          )}
            </>
          )}
        </div>
      </Widget>
    </>
  );
};
