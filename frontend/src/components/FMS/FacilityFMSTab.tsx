/**
 * Facility FMS Integration Tab
 *
 * Configuration, sync operations, and change review for facility FMS integration.
 */

import { useState, useEffect, useRef } from 'react';
import {
  CloudIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { fmsService } from '@/services/fms.service';
import { getAvailableProviders, getProviderMetadata } from '@/config/fms-providers';
import {
  FMSConfiguration,
  FMSProviderType,
  FMSSyncResult,
  FMSSyncLog,
} from '@/types/fms.types';
import { ProviderConfigForm } from './ProviderConfigForm';
import { FMSConfigSummary } from './FMSConfigSummary';
import { useToast } from '@/contexts/ToastContext';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { getFmsSyncAppliedColumnText } from '@/utils/fmsSyncLogDisplay';
import { isFMSSyncInProgressError } from '@/utils/fms-sync.utils';
import { formatDateTime } from '@/utils/datetime.utils';
import { formatPendingReviewLabel, pickOpenPendingReviewLog, FMS_PENDING_REVIEW_CHANGED } from '@/utils/fms-pending-review.utils';

interface FacilityFMSTabProps {
  facilityId: string;
  facilityName?: string;
  isDevMode?: boolean;
  canEditFMS?: boolean;
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

function enabledBadgeClass(enabled: boolean): string {
  return enabled
    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
}

export function FacilityFMSTab({
  facilityId,
  facilityName,
  isDevMode = false,
  canEditFMS = true,
}: FacilityFMSTabProps) {
  const { addToast } = useToast();
  const { canStartNewSync, startSync, completeSync, showReview, cancelSync, hasCompletedSync, openPendingReview, syncState } = useFMSSync();
  const { subscribe, unsubscribe } = useWebSocket();
  const [config, setConfig] = useState<FMSConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [, setSyncResult] = useState<FMSSyncResult | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [pendingSyncLogId, setPendingSyncLogId] = useState<string | null>(null);
  const [pendingTriggeredBy, setPendingTriggeredBy] = useState<'manual' | 'automatic' | 'webhook' | null>(null);
  const [syncHistory, setSyncHistory] = useState<FMSSyncLog[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<FMSProviderType | null>(null);
  const [configExpanded, setConfigExpanded] = useState(false);

  useEffect(() => {
    loadConfig();
    loadSyncHistory();
  }, [facilityId]);

  useEffect(() => {
    const onPendingChanged = () => {
      void loadSyncHistory();
    };
    window.addEventListener(FMS_PENDING_REVIEW_CHANGED, onPendingChanged);
    return () => window.removeEventListener(FMS_PENDING_REVIEW_CHANGED, onPendingChanged);
  }, [facilityId]);

  useEffect(() => {
    const subId = subscribe(
      'fms_sync_status',
      (data: { facilityId?: string }) => {
        if (data?.facilityId === facilityId) {
          void loadSyncHistory();
        }
      },
      undefined,
      { facilityId },
    );
    return () => unsubscribe(subId);
  }, [facilityId, subscribe, unsubscribe]);

  const prevReviewOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevReviewOpenRef.current;
    prevReviewOpenRef.current = syncState.showReviewModal;
    if (wasOpen && !syncState.showReviewModal) {
      void loadSyncHistory();
      void loadConfig();
    }
  }, [syncState.showReviewModal, facilityId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const fetchedConfig = await fmsService.getConfig(facilityId);
      setConfig(fetchedConfig);
      if (fetchedConfig) {
        setSelectedProvider(fetchedConfig.provider_type);
        setConfigExpanded(!canEditFMS);
      } else {
        setConfigExpanded(true);
      }
    } catch (error: unknown) {
      console.error('Failed to load FMS configuration:', error);
      setConfigExpanded(true);
      const message = error instanceof Error ? error.message : 'Could not load FMS configuration';
      addToast({
        type: 'error',
        title: 'Failed to Load Configuration',
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSyncHistory = async () => {
    try {
      const history = await fmsService.getSyncHistory(facilityId, { limit: 10 });
      setSyncHistory(history.logs);
      const openReview = pickOpenPendingReviewLog(history.logs);
      if (openReview) {
        setPendingReviewCount(openReview.changes_pending);
        setPendingSyncLogId(openReview.id);
        setPendingTriggeredBy(openReview.triggered_by as 'manual' | 'automatic' | 'webhook');
      } else {
        setPendingReviewCount(0);
        setPendingSyncLogId(null);
        setPendingTriggeredBy(null);
      }
    } catch (error) {
      console.error('Failed to load sync history:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!config) return;

    try {
      setTesting(true);
      const connected = await fmsService.testConnection(config.id);

      if (connected) {
        addToast({
          type: 'success',
          title: 'Connection Successful',
          message: 'Successfully connected to FMS provider',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Connection Failed',
          message: 'Please check your credentials and try again',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to test FMS connection';
      addToast({
        type: 'error',
        title: 'Connection Test Failed',
        message,
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
      if (!startSync(facilityId, facilityName || 'Unknown Facility')) {
        return;
      }

      const result = await fmsService.triggerSync(facilityId);
      setSyncResult(result);

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
            message: 'No changes detected - system is in sync with FMS',
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
      const message = error instanceof Error ? error.message : 'Failed to sync with FMS';
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message,
      });
    } finally {
      setSyncing(false);
    }
  };

  const availableProviders = getAvailableProviders(isDevMode);
  const providerName = config
    ? (getProviderMetadata(config.provider_type)?.name ?? null)
    : null;
  const showSyncPanel = Boolean(config?.is_enabled);

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

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className={`${cardClass} p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/20 shrink-0">
              <CloudIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">FMS Integration</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
                Connect your facility management system to keep tenants and units in sync. Changes from
                the FMS are reviewed before they are applied to BluLok.
              </p>
            </div>
          </div>
          {config && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${enabledBadgeClass(config.is_enabled)}`}
              >
                {config.is_enabled ? 'Integration enabled' : 'Integration disabled'}
              </span>
              {!canEditFMS && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  Read Only
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${showSyncPanel ? 'lg:grid-cols-3' : ''}`}>
        {/* Main column */}
        <div className={`space-y-6 ${showSyncPanel ? 'lg:col-span-2' : ''}`}>
          {/* Configuration */}
          <div className={`${cardClass} overflow-hidden`}>
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Cog6ToothIcon className="h-5 w-5 text-primary-500 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      FMS Configuration
                    </h3>
                    {config && !configExpanded && providerName && (
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                        Configured: {providerName}
                      </p>
                    )}
                  </div>
                </div>
                {canEditFMS && (
                  <button
                    type="button"
                    onClick={() => setConfigExpanded(!configExpanded)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                    aria-label={configExpanded ? 'Collapse configuration' : 'Expand configuration'}
                    title={configExpanded ? 'Collapse' : 'Expand'}
                  >
                    {configExpanded ? (
                      <>
                        <ChevronUpIcon className="h-4 w-4" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDownIcon className="h-4 w-4" />
                        {config ? 'Edit' : 'Set up'}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="p-6">
              {!config && !configExpanded && (
                <div className="text-center py-8">
                  <InformationCircleIcon className="mx-auto h-10 w-10 text-gray-400" />
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    No FMS provider configured for this facility yet.
                  </p>
                  {canEditFMS && (
                    <button
                      type="button"
                      onClick={() => setConfigExpanded(true)}
                      className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Configure provider
                    </button>
                  )}
                </div>
              )}

              {config && !configExpanded && (
                <FMSConfigSummary
                  config={config}
                  providerName={providerName}
                  testing={testing}
                  onTestConnection={handleTestConnection}
                  variant="collapsed"
                />
              )}

              {configExpanded && canEditFMS && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select FMS Provider
                    </label>
                    <select
                      value={selectedProvider || ''}
                      onChange={(e) => setSelectedProvider(e.target.value as FMSProviderType)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow"
                    >
                      <option value="">— Select provider —</option>
                      {availableProviders.map((provider) => (
                        <option key={provider.type} value={provider.type}>
                          {provider.name}
                          {provider.isDevOnly ? ' (Dev only)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedProvider && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {getProviderMetadata(selectedProvider)?.description}
                      </p>
                    )}
                  </div>

                  {selectedProvider && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 p-5">
                      <ProviderConfigForm
                        facilityId={facilityId}
                        providerType={selectedProvider}
                        existingConfig={config}
                        onSaved={(newConfig) => {
                          setConfig(newConfig);
                          setConfigExpanded(false);
                        }}
                      />
                    </div>
                  )}

                  {config && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 shrink-0" />
                        <span>
                          Active provider:{' '}
                          <span className="font-medium text-gray-900 dark:text-white">{providerName}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {testing ? 'Testing…' : 'Test Connection'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {configExpanded && !canEditFMS && config && (
                <FMSConfigSummary
                  config={config}
                  providerName={providerName}
                  testing={testing}
                  onTestConnection={handleTestConnection}
                  variant="detailed"
                />
              )}
            </div>
          </div>

          {/* Sync history */}
          <div className={`${cardClass} overflow-hidden`}>
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sync History</h3>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Recent sync runs for this facility
              </p>
            </div>

            {syncHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {syncHistory.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                          {formatDateTime(log.started_at)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${syncStatusBadgeClass(log.sync_status)}`}
                          >
                            {formatSyncStatusLabel(log.sync_status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {log.changes_detected || 0}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {getFmsSyncAppliedColumnText(log)}
                        </td>
                      </tr>
                    ))}
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

        {/* Sync sidebar */}
        {config && (
          <div className="space-y-6">
            <div className={`${cardClass} p-6`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/20">
                  <ArrowPathIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sync Operations</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pull latest FMS data</p>
                </div>
              </div>

              {!config.is_enabled ? (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <div className="flex gap-3">
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Enable the integration in your provider configuration before syncing.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {config.last_sync_at && (
                    <div className="mb-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <ClockIcon className="h-4 w-4 shrink-0" />
                        <span>Last sync</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDateTime(config.last_sync_at)}
                      </p>
                      {config.last_sync_status && (
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${syncStatusBadgeClass(config.last_sync_status)}`}
                        >
                          {formatSyncStatusLabel(config.last_sync_status)}
                        </span>
                      )}
                    </div>
                  )}

                  {pendingReviewCount > 0 && pendingSyncLogId && (
                    <div className="mb-5 rounded-lg border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50 dark:bg-yellow-900/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-2 min-w-0">
                          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            {formatPendingReviewLabel(pendingReviewCount, pendingTriggeredBy)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void openPendingReview(facilityId, pendingSyncLogId, facilityName).catch(
                              (error: unknown) => {
                                addToast({
                                  type: 'error',
                                  title: 'Could not open review',
                                  message:
                                    error instanceof Error ? error.message : 'Please try again',
                                });
                                void loadSyncHistory();
                              },
                            );
                          }}
                          className="text-sm font-medium text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 whitespace-nowrap transition-colors"
                        >
                          Review Changes →
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncing ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Syncing…
                      </>
                    ) : (
                      <>
                        <CloudIcon className="h-5 w-5" />
                        Sync Now
                      </>
                    )}
                  </button>
                  <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">
                    Fetches tenants and units from your FMS and surfaces changes for review.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
