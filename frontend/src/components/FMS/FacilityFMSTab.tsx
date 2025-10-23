 /**
 * Facility FMS Integration Tab
 * 
 * Main container for FMS configuration, sync operations, and change review
 */

import { useState, useEffect } from 'react';
import {
  CloudIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { fmsService } from '@/services/fms.service';
import { getAvailableProviders, getProviderMetadata } from '@/config/fms-providers';
import {
  FMSConfiguration,
  FMSProviderType,
  FMSSyncResult,
  FMSChange,
  FMSSyncLog,
} from '@/types/fms.types';
import { ProviderConfigForm } from './ProviderConfigForm';
import { useToast } from '@/contexts/ToastContext';
import { useFMSSync } from '@/contexts/FMSSyncContext';

interface FacilityFMSTabProps {
  facilityId: string;
  facilityName?: string;
  isDevMode?: boolean;
  canEditFMS?: boolean;
}

export function FacilityFMSTab({ facilityId, facilityName, isDevMode = false, canEditFMS = true }: FacilityFMSTabProps) {
  const { addToast } = useToast();
  const { canStartNewSync, startSync, completeSync, showReview } = useFMSSync();
  const [config, setConfig] = useState<FMSConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [, setSyncResult] = useState<FMSSyncResult | null>(null);
  const [pendingChanges, setPendingChanges] = useState<FMSChange[]>([]);
  const [syncHistory, setSyncHistory] = useState<FMSSyncLog[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<FMSProviderType | null>(null);
  const [configExpanded, setConfigExpanded] = useState(false);

  useEffect(() => {
    loadConfig();
    loadSyncHistory();
  }, [facilityId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const fetchedConfig = await fmsService.getConfig(facilityId);
      setConfig(fetchedConfig);
      if (fetchedConfig) {
        setSelectedProvider(fetchedConfig.provider_type);
        setConfigExpanded(!canEditFMS); // Collapse for editors, expand for readonly users
      } else {
        setConfigExpanded(true); // Auto-expand if no config
      }
    } catch (error: any) {
      console.error('Failed to load FMS configuration:', error);
      setConfigExpanded(true); // Auto-expand on error (likely no config)
      addToast({
        type: 'error',
        title: 'Failed to Load Configuration',
        message: error.message || 'Could not load FMS configuration',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSyncHistory = async () => {
    try {
      const history = await fmsService.getSyncHistory(facilityId, { limit: 10 });
      setSyncHistory(history.logs);
    } catch (error: any) {
      console.error('Failed to load sync history:', error);
      // Silent fail - history is not critical
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
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Connection Test Failed',
        message: error.message || 'Failed to test FMS connection',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
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
      setSyncing(true);

      // Start sync in global context
      startSync(facilityId, facilityName || 'Unknown Facility');

      const result = await fmsService.triggerSync(facilityId);
      setSyncResult(result);

      if (result.changesDetected && result.changesDetected.length > 0) {
        setPendingChanges(result.changesDetected);

        // Complete sync in global context
        completeSync(result.changesDetected, result);

        // Show review modal - will be handled by status bar clicking
        showReview();

        addToast({
          type: 'info',
          title: 'Changes Detected',
          message: `Found ${result.changesDetected.length} changes that need review`,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Sync Completed',
          message: 'No changes detected - system is in sync with FMS',
        });
      }

      await loadSyncHistory();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync with FMS',
      });
    } finally {
      setSyncing(false);
    }
  };


  const availableProviders = getAvailableProviders(isDevMode);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="fms-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" data-testid="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Cog6ToothIcon className="h-6 w-6 text-primary-500 mr-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              FMS Configuration
            </h3>
            {config && (
              <span className={`ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                config.is_enabled
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
              }`}>
                {config.is_enabled ? 'Enabled' : 'Disabled'}
              </span>
            )}
            {!canEditFMS && (
              <span className="ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                Read Only
              </span>
            )}
          </div>
          {canEditFMS && (
            <button
              onClick={() => setConfigExpanded(!configExpanded)}
              className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label={configExpanded ? 'Collapse configuration' : 'Expand configuration'}
              title={configExpanded ? 'Collapse' : 'Expand'}
            >
              {configExpanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {configExpanded && canEditFMS && (
          <div className="space-y-6">
            {/* Provider Selection - Always show to allow changing provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select FMS Provider
              </label>
              <select
                value={selectedProvider || ''}
                onChange={(e) => setSelectedProvider(e.target.value as FMSProviderType)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">-- Select Provider --</option>
                {availableProviders.map((provider) => (
                  <option key={provider.type} value={provider.type}>
                    {provider.name}
                    {provider.isDevOnly && ' (Dev Only)'}
                  </option>
                ))}
              </select>

              {selectedProvider && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {getProviderMetadata(selectedProvider)?.description}
                </p>
              )}
            </div>

            {/* Provider Configuration Form */}
            {selectedProvider && (
              <ProviderConfigForm
                facilityId={facilityId}
                providerType={selectedProvider}
                existingConfig={config}
                onSaved={(newConfig) => {
                  setConfig(newConfig);
                  setConfigExpanded(false);
                }}
              />
            )}

            {config && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Provider: <span className="font-medium">{getProviderMetadata(config.provider_type)?.name}</span>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Read-only configuration summary for facility managers */}
        {configExpanded && !canEditFMS && config && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  FMS Provider
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="text-sm text-gray-900 dark:text-white font-medium">
                    {getProviderMetadata(config.provider_type)?.name}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {getProviderMetadata(config.provider_type)?.description}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    config.is_enabled
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                  }`}>
                    {config.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Configuration managed by administrators
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        )}

        {config && !configExpanded && (
          <div className="flex items-center text-sm pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
              Configured: {getProviderMetadata(config.provider_type)?.name}
            </div>
          </div>
        )}
      </div>

      {/* Sync Section */}
      {config && config.is_enabled && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <ArrowPathIcon className="h-6 w-6 text-primary-500 mr-3" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Sync Operations
              </h3>
            </div>
          </div>

          {/* Last Sync Info */}
          {config.last_sync_at && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <ClockIcon className="h-4 w-4 mr-2" />
                  Last Sync: {new Date(config.last_sync_at).toLocaleString()}
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  config.last_sync_status === 'completed'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  {config.last_sync_status || 'Unknown'}
                </div>
              </div>
            </div>
          )}

          {/* Pending Changes Alert */}
          {pendingChanges.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                  <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                    {pendingChanges.length} changes pending review
                  </span>
                </div>
                <button
                  onClick={() => showReview()}
                  className="text-sm text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 font-medium"
                >
                  Review Changes →
                </button>
              </div>
            </div>
          )}

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {syncing ? (
              <>
                <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <CloudIcon className="h-5 w-5 mr-2" />
                Sync Now
              </>
            )}
          </button>

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            Sync will fetch latest data from FMS and detect changes
          </p>
        </div>
      )}

      {/* Sync History */}
      {syncHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Sync History
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Changes
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Applied
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {syncHistory.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {new Date(log.started_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.sync_status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : log.sync_status === 'failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                      }`}>
                        {log.sync_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {log.changes_detected || 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {log.changes_applied === log.changes_detected && log.changes_pending === 0 && log.changes_detected > 0
                        ? 'Auto Accepted'
                        : log.changes_applied === log.changes_detected && log.changes_detected > 0
                        ? 'All Applied'
                        : (log.changes_applied || 0)
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
