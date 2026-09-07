import { useState } from 'react';
import {
  ServerIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  CloudIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { getWsBaseUrl } from '@/services/appConfig';
import { formatDateTime, formatTime } from '@/utils/datetime.utils';

interface SyncLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: unknown;
}

type SyncGateway = {
  id: string;
};

export type GatewayManualSyncPanelProps = {
  gateway: SyncGateway | null;
  facilityId: string;
  recoveryBlocking: boolean;
  isPlatformAdmin: boolean;
  onNavigateToInventorySync?: () => void;
  copyToClipboard: (value: string, successTitle?: string) => void | Promise<void>;
};

/**
 * Manual outbound device-status sync panel for the Facility Gateway Sync tab.
 * Results are ephemeral (not written to the inventory sync audit trail).
 */
export function GatewayManualSyncPanel({
  gateway,
  facilityId,
  recoveryBlocking,
  isPlatformAdmin,
  onNavigateToInventorySync,
  copyToClipboard,
}: GatewayManualSyncPanelProps) {
  const { addToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSyncResults, setLastSyncResults] = useState<{
    devices: any[];
    syncResults: {
      devicesFound: number;
      devicesSynced: number;
      keysRetrieved: number;
      errors: string[];
    };
  } | null>(null);

  const handleManualSync = async () => {
    if (recoveryBlocking) {
      addToast({
        type: 'error',
        title: 'Sync blocked',
        message: 'Gateway recovery is in progress. Complete or bypass recovery before running manual sync.',
      });
      return;
    }
    if (!gateway) return;

    setSyncing(true);
    setSyncLogs([]);

    const addLog = (level: SyncLogEntry['level'], message: string, details?: unknown) => {
      setSyncLogs((prev) => [
        ...prev,
        {
          timestamp: new Date(),
          level,
          message,
          details,
        },
      ]);
    };

    try {
      addLog('info', 'Starting manual gateway synchronization...');

      const syncResponse = await apiService.syncGateway(gateway.id);
      const syncData = syncResponse?.data;

      if (syncData) {
        setLastSyncResults(syncData);
      }

      addLog('success', 'Gateway synchronization completed successfully');

      if (syncData?.syncResults) {
        const { devicesFound, devicesSynced, keysRetrieved, errors } = syncData.syncResults;
        addLog('info', `Sync completed - found ${devicesFound} devices, synced ${devicesSynced} devices`);
        addLog('info', `Retrieved ${keysRetrieved} keys from gateway`);

        if (errors.length > 0) {
          addLog('warn', `Sync completed with ${errors.length} warning(s)`);
          errors.forEach((error: string, index: number) => {
            addLog('error', `Error ${index + 1}: ${error}`);
          });
        } else {
          addLog('success', 'No errors or warnings during sync');
        }
      }

      if (syncData?.devices && syncData.devices.length > 0) {
        addLog('info', `Retrieved details for ${syncData.devices.length} devices`);
      }

      setLastSyncTime(new Date());
      addToast({ type: 'success', title: 'Gateway synchronization completed' });
    } catch (error: any) {
      console.error('Sync failed:', error);
      const message = error?.response?.data?.message || 'Gateway synchronization failed';
      const detailedError = error?.response?.data?.error || message;

      addLog('error', `Synchronization failed: ${detailedError}`);
      addToast({ type: 'error', title: message });
    } finally {
      setSyncing(false);
    }
  };

  const renderGatewayModeInfo = () => {
    if (!gateway) return null;
    const wsBase = getWsBaseUrl().trim();
    const wsUrl = wsBase ? `${wsBase}/ws/gateway` : '(configure VITE_WS_URL or VITE_API_URL)';
    const authExample = `{"type":"AUTH","token":"<JWT from this API>","facilityId":"${facilityId}"}`;
    return (
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-sm space-y-3">
        <p className="text-gray-700 dark:text-gray-300">
          Gateways connect with <strong className="font-semibold">WSS</strong> (or <strong className="font-semibold">WS</strong> in local dev). Do{' '}
          <strong className="font-semibold">not</strong> put <code className="text-xs">?token=</code> on the URL. After connect, send{' '}
          <strong className="font-semibold">AUTH</strong> as the first JSON message.
        </p>
        <div>
          <p className="text-gray-700 dark:text-gray-300 mb-2">WebSocket URL</p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 break-all">{wsUrl}</code>
            <button
              type="button"
              disabled={!wsBase}
              onClick={() => wsBase && void copyToClipboard(wsUrl, 'Copied WebSocket URL')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Copy WebSocket URL"
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
              Copy
            </button>
          </div>
        </div>
        <div>
          <p className="text-gray-700 dark:text-gray-300 mb-2">First message (example)</p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 break-all max-w-full text-xs">{authExample}</code>
            <button
              type="button"
              onClick={() => void copyToClipboard(authExample, 'Copied AUTH example')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              aria-label="Copy AUTH JSON example"
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
              Copy AUTH JSON
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!gateway) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center py-8">
          <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Bind a gateway via Swap / Recovery before syncing. See Overview for connection URLs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Manual device status sync</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Pulls live lock/device status from the bound gateway over the legacy outbound sync path. Results appear below
          and are not written to the{' '}
          {isPlatformAdmin && onNavigateToInventorySync ? (
            <>
              <button
                type="button"
                onClick={onNavigateToInventorySync}
                className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Inventory sync
              </button>{' '}
              audit trail
            </>
          ) : (
            'inventory sync audit trail'
          )}
          .
        </p>
        {recoveryBlocking && (
          <div
            className="mb-4 rounded-lg border border-amber-300/60 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
            role="status"
          >
            Gateway recovery in progress. Manual sync is blocked until it finishes or is bypassed.
          </div>
        )}
        {renderGatewayModeInfo()}
        <button
          onClick={() => void handleManualSync()}
          disabled={syncing || recoveryBlocking}
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
          Fetches latest device status from the gateway (not gateway inventory reconcile)
        </p>
        {lastSyncTime && (
          <div className="mt-4 flex items-center text-sm text-gray-600 dark:text-gray-400">
            <ClockIcon className="h-4 w-4 mr-2" />
            Last sync: {formatDateTime(lastSyncTime)}
          </div>
        )}
      </div>

      {syncLogs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Sync Logs</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {syncLogs.map((log, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  {log.level === 'success' && <CheckCircleIcon className="h-5 w-5 text-green-500" />}
                  {log.level === 'error' && <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />}
                  {log.level === 'warn' && <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />}
                  {log.level === 'info' && <PlayIcon className="h-5 w-5 text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white">{log.message}</p>
                  {log.details != null && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 font-mono">
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(log.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastSyncResults && lastSyncResults.devices.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Last Synced Devices</h3>
          <div className="grid gap-4">
            {lastSyncResults.devices.map((device, index) => (
              <div key={device.id || index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${device.online ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {device.serial || device.id}
                      </h4>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{device.id}</div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        device.locked
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}
                    >
                      {device.locked ? 'Locked' : 'Unlocked'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Signal:</span>
                    <span className="ml-1 font-medium">{device.signalStrength}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Temp:</span>
                    <span className="ml-1 font-medium">{device.temperature?.toFixed(1)}°C</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Keys:</span>
                    <span className="ml-1 font-medium">{device.keys?.length || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Status:</span>
                    <span className="ml-1 font-medium">{device.online ? 'online' : 'offline'}</span>
                  </div>
                </div>
                {device.keys && device.keys.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keys:</h5>
                    <div className="flex flex-wrap gap-2">
                      {device.keys.map((key: any, keyIndex: number) => (
                        <div
                          key={keyIndex}
                          className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs"
                        >
                          <span className="font-mono">{key.keyCode || key.code}</span>
                          {key.user && (
                            <span className="ml-1 text-gray-600 dark:text-gray-400">({key.user})</span>
                          )}
                          {key.valid !== undefined && (
                            <span className={`ml-1 ${key.valid ? 'text-green-600' : 'text-red-600'}`}>
                              {key.valid ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Devices Found: {lastSyncResults.syncResults.devicesFound}</span>
              <span>Devices Synced: {lastSyncResults.syncResults.devicesSynced}</span>
              <span>Keys Retrieved: {lastSyncResults.syncResults.keysRetrieved}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
