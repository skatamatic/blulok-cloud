/**
 * Simplified FMS Integration view for facility admins with simplified UI.
 * Hides configuration/technical surfaces; focuses on test, sync, review, and history.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CloudIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { fmsService } from '@/services/fms.service';
import { FMSConfiguration, FMSSyncLog, FMSSyncResult } from '@/types/fms.types';
import { useToast } from '@/contexts/ToastContext';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { getFmsSyncAppliedColumnText } from '@/utils/fmsSyncLogDisplay';
import { isFMSSyncInProgressError } from '@/utils/fms-sync.utils';
import { formatDateTime } from '@/utils/datetime.utils';
import { pickOpenPendingReviewLog, FMS_PENDING_REVIEW_CHANGED } from '@/utils/fms-pending-review.utils';

interface FacilityFMSSimplifiedViewProps {
  facilityId: string;
  facilityName?: string;
}

const cardClass =
  'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm';

function formatSyncStatusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function syncStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    case 'pending_review':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  }
}

export function FacilityFMSSimplifiedView({
  facilityId,
  facilityName,
}: FacilityFMSSimplifiedViewProps) {
  const { addToast } = useToast();
  const {
    canStartNewSync,
    startSync,
    completeSync,
    showReview,
    cancelSync,
    hasCompletedSync,
    openPendingReview,
    syncState,
  } = useFMSSync();
  const { subscribe, unsubscribe } = useWebSocket();

  const [config, setConfig] = useState<FMSConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncHistory, setSyncHistory] = useState<FMSSyncLog[]>([]);
  const [liveProgress, setLiveProgress] = useState<{
    step: string;
    percent: number;
  } | null>(null);
  const historyLoadSeqRef = useRef(0);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setConfig(await fmsService.getConfig(facilityId));
    } catch (error: unknown) {
      console.error('Failed to load FMS configuration:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load FMS',
        message: error instanceof Error ? error.message : 'Could not load FMS status',
      });
    } finally {
      setLoading(false);
    }
  }, [facilityId, addToast]);

  const loadSyncHistory = useCallback(async () => {
    const seq = ++historyLoadSeqRef.current;
    try {
      const history = await fmsService.getSyncHistory(facilityId, { limit: 15 });
      if (seq !== historyLoadSeqRef.current) return;
      setSyncHistory(history.logs);
      const hasInProgress = history.logs.some((log) => log.sync_status === 'in_progress');
      if (!hasInProgress) {
        setLiveProgress(null);
      }
    } catch (error) {
      console.error('Failed to load sync history:', error);
    }
  }, [facilityId]);

  useEffect(() => {
    void loadConfig();
    void loadSyncHistory();
  }, [loadConfig, loadSyncHistory]);

  useEffect(() => {
    const onPendingChanged = () => {
      void loadSyncHistory();
    };
    window.addEventListener(FMS_PENDING_REVIEW_CHANGED, onPendingChanged);
    return () => window.removeEventListener(FMS_PENDING_REVIEW_CHANGED, onPendingChanged);
  }, [loadSyncHistory]);

  useEffect(() => {
    const statusSubId = subscribe(
      'fms_sync_status',
      (data: { updatedFacilityId?: string; facilityId?: string }) => {
        const target = data?.updatedFacilityId ?? data?.facilityId;
        if (target && target !== facilityId) return;
        void loadSyncHistory();
      },
      undefined,
      { facilityId },
    );
    const progressSubId = subscribe(
      'fms_sync_progress',
      (data: { facilityId?: string; step?: string; percent?: number }) => {
        if (data?.facilityId && data.facilityId !== facilityId) return;
        if (typeof data?.percent === 'number' || data?.step) {
          setLiveProgress({
            step: data.step || 'Syncing',
            percent: typeof data.percent === 'number' ? data.percent : 0,
          });
        }
        void loadSyncHistory();
      },
      undefined,
      { facilityId },
    );
    return () => {
      unsubscribe(statusSubId);
      unsubscribe(progressSubId);
    };
  }, [facilityId, subscribe, unsubscribe, loadSyncHistory]);

  useEffect(() => {
    if (!syncState.showReviewModal) {
      void loadSyncHistory();
    }
  }, [syncState.showReviewModal, loadSyncHistory]);

  const handleTestConnection = async () => {
    if (!config) return;
    try {
      setTesting(true);
      const connected = await fmsService.testConnection(config.id);
      addToast(
        connected
          ? {
              type: 'success',
              title: 'Connection Successful',
              message: 'Successfully connected to FMS provider',
            }
          : {
              type: 'error',
              title: 'Connection Failed',
              message: 'Please check with your administrator',
            },
      );
    } catch (error: unknown) {
      addToast({
        type: 'error',
        title: 'Connection Test Failed',
        message: error instanceof Error ? error.message : 'Failed to test FMS connection',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!canStartNewSync()) {
      addToast({
        type: 'warning',
        title: 'Sync Already in Progress',
        message: 'Please wait for the current sync to complete',
      });
      return;
    }

    try {
      setSyncing(true);
      setLiveProgress({ step: 'Starting sync', percent: 0 });
      if (!startSync(facilityId, facilityName || 'Unknown Facility')) {
        return;
      }

      const result: FMSSyncResult = await fmsService.triggerSync(facilityId);

      if (!hasCompletedSync()) {
        if (result.changesDetected && result.changesDetected.length > 0) {
          completeSync(result.changesDetected, result);
          showReview();
          addToast({
            type: 'info',
            title: 'Changes Detected',
            message: `Found ${result.changesDetected.length} changes that need review`,
          });
        } else {
          completeSync([], result);
          addToast({
            type: 'success',
            title: 'Sync Completed',
            message: 'No changes detected — system is in sync with FMS',
          });
        }
      } else if (result.changesDetected && result.changesDetected.length > 0) {
        showReview();
      }

      await loadSyncHistory();
      await loadConfig();
    } catch (error: unknown) {
      if (isFMSSyncInProgressError(error)) {
        return;
      }
      cancelSync();
      setLiveProgress(null);
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: error instanceof Error ? error.message : 'Failed to sync with FMS',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleReview = async (syncLogId: string) => {
    try {
      await openPendingReview(facilityId, syncLogId, facilityName);
    } catch (error: unknown) {
      addToast({
        type: 'error',
        title: 'Review Unavailable',
        message: error instanceof Error ? error.message : 'Could not open pending review',
      });
      void loadSyncHistory();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="fms-loading">
        <div
          className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 dark:border-primary-900 dark:border-t-primary-400"
          data-testid="loading-spinner"
        />
      </div>
    );
  }

  const enabled = Boolean(config?.is_enabled);
  const openReview = pickOpenPendingReviewLog(syncHistory);

  return (
    <div className="space-y-6" data-testid="fms-simplified-view">
      <div className={`${cardClass} p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/20 shrink-0">
              <CloudIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">FMS Sync</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
                Keep tenants and units in sync with your facility management system. Review changes
                before they are applied.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={!config || testing}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={!enabled || syncing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <CloudIcon className="h-4 w-4" />
                  Sync Now
                </>
              )}
            </button>
          </div>
        </div>

        {!config && (
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              FMS is not configured for this facility. Contact your BluLok administrator.
            </p>
          </div>
        )}

        {config && !enabled && (
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              FMS integration is disabled. Contact your BluLok administrator to enable syncing.
            </p>
          </div>
        )}
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sync History</h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Live updates appear here as syncs run
            </p>
          </div>
          {openReview && (
            <button
              type="button"
              onClick={() => void handleReview(openReview.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-yellow-800 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800/50 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors"
            >
              Review pending changes →
            </button>
          )}
        </div>

        {liveProgress && (
          <div
            className="px-6 py-3 border-b border-blue-100 dark:border-blue-900/40 bg-blue-50/80 dark:bg-blue-900/20 flex items-center gap-3"
            data-testid="fms-live-progress"
          >
            <ArrowPathIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                {liveProgress.step}
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-blue-100 dark:bg-blue-950 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, liveProgress.percent))}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300 tabular-nums">
              {Math.round(liveProgress.percent)}%
            </span>
          </div>
        )}

        {syncHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/30 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Changes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Applied
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {syncHistory.map((log) => {
                  const canReview =
                    log.sync_status === 'pending_review' && (log.changes_pending || 0) > 0;
                  const isLiveRow = log.sync_status === 'in_progress' && liveProgress;
                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        isLiveRow
                          ? 'bg-blue-50/60 dark:bg-blue-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                        {formatDateTime(log.started_at)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${syncStatusBadgeClass(log.sync_status)}`}
                        >
                          {isLiveRow
                            ? `${formatSyncStatusLabel(log.sync_status)} · ${Math.round(liveProgress.percent)}%`
                            : formatSyncStatusLabel(log.sync_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {log.changes_detected || 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {getFmsSyncAppliedColumnText(log)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canReview ? (
                          <button
                            type="button"
                            onClick={() => void handleReview(log.id)}
                            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                          >
                            Review
                          </button>
                        ) : log.sync_status === 'completed' ? (
                          <CheckCircleIcon className="inline-block h-5 w-5 text-green-500" aria-label="Completed" />
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <ClockIcon className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              No sync history yet. Run a sync to see activity here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
