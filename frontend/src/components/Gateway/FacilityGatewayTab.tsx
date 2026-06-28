import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ServerIcon,
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  CloudIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  DocumentDuplicateIcon,
  CpuChipIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import GatewayFirmwareTab from './GatewayFirmwareTab';
import { useFacilityGatewayRecovery } from '@/hooks/useFacilityGatewayRecovery';
import GatewaySwapRecoveryTab from './GatewaySwapRecoveryTab';
import RecoveryBlockingBanner from './RecoveryBlockingBanner';
import { GatewayDeviceSyncHistory } from './GatewayDeviceSyncHistory';
import { GatewayTelemetryLogsTab } from './GatewayTelemetryLogsTab';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { usePromptDialog } from '@/hooks/usePromptDialog';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/Modal/Modal';
import { getApiBaseUrl, getWsBaseUrl } from '@/services/appConfig';
import { UserRole } from '@/types/auth.types';
import { useFacilityGatewayLiveStatus } from '@/hooks/useFacilityGatewayLiveStatus';
import { gatewayOperationalStatusColors } from '@/utils/facility-gateway-live-status.utils';
import { formatDateTime, formatTime, formatUtcDateTime } from '@/utils/datetime.utils';

interface SyncLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

interface RotationResult {
  payload: { cmd_type: 'ROTATE_OPERATIONS_KEY'; new_ops_pubkey: string; ts: number };
  signature: string;
  generated_ops_key_pair?: { private_key_b64: string; public_key_b64: string };
}

interface FacilityGatewayTabProps {
  facilityId: string;
  facilityName: string;
  canManageGateway: boolean;
  liveStatus: ReturnType<typeof useFacilityGatewayLiveStatus>;
}

function FacilityGatewayTab({ facilityId, facilityName, canManageGateway, liveStatus }: FacilityGatewayTabProps) {
  const { addToast } = useToast();
  const ws = useWebSocket();
  const {
    gateway,
    wsConnected,
    lastActivityAt,
    effectiveStatus,
    loading,
    reload,
  } = liveStatus;

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
  const [activeTab, setActiveTab] = useState<'overview' | 'sync' | 'inventory-sync' | 'gateway-logs' | 'firmware' | 'swap-recovery' | 'devtools'>('overview');

  // Debug panel state
  const [fallbackJwtInput, setFallbackJwtInput] = useState('');
  const [rootPrivateKeyInput, setRootPrivateKeyInput] = useState('');
  const [customOpsPublicKeyInput, setCustomOpsPublicKeyInput] = useState('');
  const [rotationModal, setRotationModal] = useState<{ isOpen: boolean; stage: 'confirm' | 'result'; result?: RotationResult | null }>({
    isOpen: false,
    stage: 'confirm',
    result: null
  });
  const [rotationSubmitting, setRotationSubmitting] = useState(false);
  const { authState } = useAuth();
  const userRole = authState.user?.role;
  const isDevAdmin = userRole === UserRole.DEV_ADMIN;
  const isPlatformAdmin = userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN;
  const { openPrompt, promptDialog } = usePromptDialog();
  const swapRecoveryAlertRef = useRef(false);
  const {
    hasSwapAlert,
    isBlocking: recoveryBlocking,
    hasActiveRecovery,
    refetch: refetchRecoverySummary,
  } = useFacilityGatewayRecovery(facilityId, canManageGateway && activeTab !== 'swap-recovery');

  const handleRecoveryChange = useCallback(async (snapshot?: { status?: import('@/types/gateway-recovery.types').GatewayRecoveryStatus; terminal?: boolean }) => {
    await refetchRecoverySummary({ silent: true });
    if (
      snapshot?.terminal
      && (snapshot.status === 'complete' || snapshot.status === 'bypassed')
    ) {
      await reload();
    }
  }, [refetchRecoverySummary, reload]);

  // Gateway debug stream (DEV tools)
  const [gatewayDebugEvents, setGatewayDebugEvents] = useState<any[]>([]);
  const [lastGatewayActivityAt, setLastGatewayActivityAt] = useState<number | null>(null);
  const [lastPingTs, setLastPingTs] = useState<number | null>(null);
  const [lastPongTs, setLastPongTs] = useState<number | null>(null);
  const gatewayWsUrl = useMemo(() => {
    const base = getWsBaseUrl().trim();
    return base ? `${base}/ws/gateway` : '';
  }, []);

  /** REST API base for gateway env (`CLOUD_API`); matches deployed backend the UI talks to. */
  const backendApiUrl = useMemo(() => {
    const base = getApiBaseUrl().replace(/\/+$/, '');
    return base ? `${base}/api/v1` : '';
  }, []);

  const copyToClipboard = useCallback(async (value: string, successTitle = 'Copied WebSocket URL') => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      addToast({ type: 'success', title: successTitle });
    } catch (err) {
      console.error('Failed to copy WebSocket URL', err);
      addToast({ type: 'error', title: 'Failed to copy WebSocket URL' });
    }
  }, [addToast]);

  const handleOpenRotationModal = () => {
    if (!rootPrivateKeyInput.trim()) {
      addToast({ type: 'error', title: 'Root private key is required' });
      return;
    }
    setRotationModal({ isOpen: true, stage: 'confirm', result: null });
  };

  const handleCloseRotationModal = () => {
    setRotationModal({ isOpen: false, stage: 'confirm', result: null });
    setRotationSubmitting(false);
  };

  const submitRotation = async () => {
    setRotationSubmitting(true);
    try {
      const response = await apiService.rotateOpsKey({
        rootPrivateKeyB64: rootPrivateKeyInput.trim(),
        customOpsPublicKeyB64: customOpsPublicKeyInput.trim() || undefined,
      });
      setRotationModal({ isOpen: true, stage: 'result', result: response });
      addToast({ type: 'success', title: 'Ops key rotation broadcasted' });
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to rotate ops key';
      addToast({ type: 'error', title: message });
    } finally {
      setRotationSubmitting(false);
    }
  };

  // Subscribe to gateway debug WS stream (DEV admin only)
  useEffect(() => {
    if (!ws || !isDevAdmin) return;

    const subscriptionId = ws.subscribe(
      'gateway_debug',
      (event: any) => {
        // Server-side scoping (facility_id filter) already restricts this feed to the
        // facility being viewed; this guard is defense-in-depth.
        if (!event || (event.facilityId && event.facilityId !== facilityId)) {
          return;
        }
        setGatewayDebugEvents(prev => {
          const next = [...prev, event];
          // Keep the most recent 200 events to avoid unbounded growth
          return next.slice(-200);
        });
        if (typeof event.lastActivityAt === 'number') {
          setLastGatewayActivityAt(event.lastActivityAt);
        }
        if (event.kind === 'ping_sent') {
          setLastPingTs(event.ts || Date.now());
        }
        if (event.kind === 'pong_received') {
          setLastPongTs(event.ts || Date.now());
        }
      },
      undefined, // no error handler needed
      // Scope the live debug stream to this facility so traffic from other gateways
      // never reaches this client.
      { filters: { facility_id: facilityId } },
    );

    return () => {
      if (subscriptionId) {
        ws.unsubscribe(subscriptionId);
      }
    };
  }, [ws, facilityId, isDevAdmin]);

  useEffect(() => {
    swapRecoveryAlertRef.current = false;
  }, [facilityId]);

  useEffect(() => {
    if (!canManageGateway || !hasSwapAlert || swapRecoveryAlertRef.current) return;
    swapRecoveryAlertRef.current = true;
    setActiveTab('swap-recovery');
  }, [canManageGateway, hasSwapAlert, facilityId]);

  const renderSwapRecoveryOverviewAlert = () => {
    if (!canManageGateway || !hasSwapAlert) return null;
    return (
      <div
        className="rounded-lg border border-[#147FD4]/30 bg-[#147FD4]/5 dark:bg-[#147FD4]/10 px-4 py-3"
        role="alert"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-[#147FD4] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {hasActiveRecovery ? 'Gateway swap recovery in progress' : 'New swap gateway detected'}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {recoveryBlocking
                  ? 'Inventory sync and remote lock commands are blocked until recovery completes or is bypassed.'
                  : 'A replacement gateway connected — review swap recovery before trusting new inventory.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('swap-recovery')}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1269b0] transition-colors"
          >
            Open Swap / Recovery
          </button>
        </div>
      </div>
    );
  };

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

    const addLog = (level: SyncLogEntry['level'], message: string, details?: any) => {
      setSyncLogs(prev => [...prev, {
        timestamp: new Date(),
        level,
        message,
        details
      }]);
    };

    try {
      addLog('info', 'Starting manual gateway synchronization...');

      const syncResponse = await apiService.syncGateway(gateway.id);
      const syncData = syncResponse?.data;

      // Store the sync results for display
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

      // Log detailed error in sync logs
      addLog('error', `Synchronization failed: ${detailedError}`);

      // Keep toast concise - use the actual error message
      addToast({ type: 'error', title: message });
    } finally {
      setSyncing(false);
    }
  };

  /** Shown on Sync tab — mesh gateways all use inbound WSS + AUTH (see Overview for copy-paste URLs). */
  const renderGatewayModeInfo = () => {
    if (!gateway) return null;
    const wsBase = getWsBaseUrl().trim();
    const wsUrl = wsBase ? `${wsBase}/ws/gateway` : '(configure VITE_WS_URL or VITE_API_URL)';
    const authExample = `{"type":"AUTH","token":"<JWT from this API>","facilityId":"${facilityId}"}`;
    return (
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-sm space-y-3">
        <p className="text-gray-700 dark:text-gray-300">
          Gateways connect with <strong className="font-semibold">WSS</strong> (or <strong className="font-semibold">WS</strong> in local dev). The server does{' '}
          <strong className="font-semibold">not</strong> use <code className="text-xs">?token=</code> on the URL — after the socket opens, send{' '}
          <strong className="font-semibold">AUTH</strong> as the first JSON message.
        </p>
        <div>
          <p className="text-gray-700 dark:text-gray-300 mb-2">WebSocket URL</p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 break-all">{wsUrl}</code>
            <button
              type="button"
              disabled={!wsBase}
              onClick={() => wsBase && copyToClipboard(wsUrl, 'Copied WebSocket URL')}
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
              onClick={() => copyToClipboard(authExample, 'Copied AUTH example')}
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

  // Navigation tabs
  const navTabs = [
    { id: 'overview' as const, label: 'Overview', icon: InformationCircleIcon },
    { id: 'sync' as const, label: 'Sync', icon: CloudIcon },
    ...(isPlatformAdmin
      ? [{ id: 'inventory-sync' as const, label: 'Inventory sync', icon: ClipboardDocumentListIcon }]
      : []),
    ...(canManageGateway
      ? [{ id: 'gateway-logs' as const, label: 'Gateway Logs', icon: DocumentTextIcon }]
      : []),
    { id: 'firmware' as const, label: 'Firmware', icon: CpuChipIcon },
    ...(canManageGateway
      ? [{ id: 'swap-recovery' as const, label: 'Swap / Recovery', icon: ArrowPathIcon }]
      : []),
    { id: 'devtools' as const, label: 'DevTools/Diag', icon: WrenchScrewdriverIcon },
  ];

  if (loading) {
    return (
      <div className="flex gap-6">
        <div className="w-64 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
            <nav className="space-y-1">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <div
                    key={tab.id}
                    className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg text-gray-400 dark:text-gray-500"
                  >
                    <Icon className="h-5 w-5 mr-3 shrink-0 opacity-50" />
                    <span className="flex-1 text-left">{tab.label}</span>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading gateway configuration...</span>
        </div>
      </div>
    );
  }

  // Render Overview Tab
  const renderOverviewTab = () => {
    if (!gateway) {
      return (
        <div className="space-y-6">
          {renderSwapRecoveryOverviewAlert()}
          {wsConnected && (
            <div
              className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
              role="status"
            >
              <p className="font-medium">WebSocket session active — no gateway assigned yet</p>
              <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
                A gateway has authenticated to this facility for <code className="text-xs font-mono px-1 rounded bg-white/60 dark:bg-black/20">/ws/gateway</code>, but this facility
                does not have a bound gateway yet. Open <strong className="font-semibold">Swap / Recovery</strong> to complete first-install binding, or contact BluLok for setup assistance.
              </p>
              {lastActivityAt && (
                <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/80">
                  Last activity: {formatDateTime(new Date(lastActivityAt))}
                </p>
              )}
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No gateway assigned</h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-lg mx-auto">
              No gateway has been bound to this facility yet. Power on your gateway with the facility UUID configured, then use the{' '}
              <strong className="font-semibold">Swap / Recovery</strong> tab to bind it. Contact BluLok if you need help with first-time setup.
            </p>
            {canManageGateway && (
              <button
                type="button"
                onClick={() => setActiveTab('swap-recovery')}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1269b0] transition-colors"
              >
                Open Swap / Recovery
              </button>
            )}
          </div>
        </div>
      );
    }

    const connectionBadgeClass = gatewayOperationalStatusColors[effectiveStatus];

    return (
      <div className="space-y-6">
        {renderSwapRecoveryOverviewAlert()}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Gateway Overview</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          On-site gateways open a secure WebSocket to <code className="text-xs font-mono bg-gray-100 dark:bg-gray-900/50 px-1 rounded">/ws/gateway</code> and authenticate
          with a facility-scoped JWT. Use the URLs below in your gateway configuration (same values as <code className="text-xs">CLOUD_WS</code> and{' '}
          <code className="text-xs">CLOUD_API</code> in the mesh bundle).
        </p>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Endpoints</div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">WebSocket URL (WSS)</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-900 dark:text-white break-all">
                  {gatewayWsUrl || '(configure VITE_WS_URL or VITE_API_URL)'}
                </code>
                <button
                  type="button"
                  disabled={!gatewayWsUrl}
                  onClick={() => gatewayWsUrl && copyToClipboard(gatewayWsUrl, 'Copied WebSocket URL')}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  aria-label="Copy WebSocket URL"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Backend API URL</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-900 dark:text-white break-all">
                  {backendApiUrl || '(configure VITE_API_URL or runtime apiBaseUrl)'}
                </code>
                <button
                  type="button"
                  disabled={!backendApiUrl}
                  onClick={() => backendApiUrl && copyToClipboard(backendApiUrl, 'Copied API URL')}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Copy backend API URL"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Gateway status</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${connectionBadgeClass}`}>
                {effectiveStatus}
              </span>
              {effectiveStatus === 'online' && lastActivityAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Last activity: {formatDateTime(new Date(lastActivityAt))}
                </span>
              )}
              {effectiveStatus === 'offline' && gateway.last_seen && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Last seen (inventory): {formatDateTime(gateway.last_seen)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Facility ID</div>
            <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{facilityId}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Facility name</div>
            <div className="mt-1 font-medium text-gray-900 dark:text-white break-words">{facilityName}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Gateway</h4>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.name}</dd>
              </div>
              {gateway.model && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Model</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.model}</dd>
                </div>
              )}
              {gateway.firmware_version && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Firmware version</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.firmware_version}</dd>
                </div>
              )}
            </dl>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Network</h4>
            <dl className="space-y-3">
              {gateway.ip_address && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">IP address</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{gateway.ip_address}</dd>
                </div>
              )}
              {gateway.mac_address && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">MAC address</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{gateway.mac_address}</dd>
                </div>
              )}
              {!gateway.ip_address && !gateway.mac_address && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No network metadata reported yet.</p>
              )}
            </dl>
          </div>
        </div>
        </div>
      </div>
    );
  };

  // Render Sync Tab
  const renderSyncTab = () => {
    if (!gateway) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center py-8">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Bind a gateway via Swap / Recovery before running sync. See Overview for the WebSocket and API URLs your gateway needs.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Sync Now Button */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Manual device status sync</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Pulls live lock/device status from the bound gateway over the legacy outbound sync path. Results appear below
            and are not written to the{' '}
            {isPlatformAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('inventory-sync')}
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
              Gateway recovery is in progress — manual sync is blocked until recovery completes or is bypassed.
            </div>
          )}
          {renderGatewayModeInfo()}
          <button
            onClick={handleManualSync}
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

        {/* Sync Logs */}
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
                    {log.details && (
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

        {/* Last Synced Devices */}
        {lastSyncResults && lastSyncResults.devices.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Last Synced Devices</h3>
            <div className="grid gap-4">
              {lastSyncResults.devices.map((device, index) => (
                <div key={device.id || index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${device.online ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {device.serial || device.id}
                        </h4>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{device.id}</div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        device.locked ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}>
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
                          <div key={keyIndex} className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                            <span className="font-mono">{key.keyCode || key.code}</span>
                            {key.user && <span className="ml-1 text-gray-600 dark:text-gray-400">({key.user})</span>}
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
  };

  const renderRotationModal = () => (
    <Modal
      isOpen={rotationModal.isOpen}
      onClose={handleCloseRotationModal}
      size={rotationModal.stage === 'result' ? 'lg' : 'md'}
      showCloseButton={rotationModal.stage === 'result'}
    >
      {rotationModal.stage === 'confirm' ? (
        <>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Operations Key Rotation</h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              This broadcasts a new operations key to every gateway. To fully complete the rotation you must:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Capture the Ops key details shown after this confirmation.</li>
              <li>Update <code className="font-mono">OPS_ED25519_PRIVATE_KEY_B64</code> and <code className="font-mono">OPS_ED25519_PUBLIC_KEY_B64</code> in the backend environment.</li>
              <li>Restart backend services so the new private key takes effect.</li>
              <li>Keep the root private key secure—it's only used to sign this packet and is never stored.</li>
            </ul>
          </ModalBody>
          <ModalFooter>
            <button className="btn-secondary" onClick={handleCloseRotationModal} disabled={rotationSubmitting}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submitRotation} disabled={rotationSubmitting}>
              {rotationSubmitting ? 'Processing...' : 'Rotate Ops Key'}
            </button>
          </ModalFooter>
        </>
      ) : (
        <>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ops Key Rotation Broadcasted</h3>
          </ModalHeader>
          <ModalBody>
            {rotationModal.result && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">New Ops Public Key</div>
                  <div className="mt-1 flex items-center gap-3 flex-wrap">
                    <code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 break-all">
                      {rotationModal.result.payload.new_ops_pubkey}
                    </code>
                    <button
                      className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                      onClick={() => copyToClipboard(rotationModal.result!.payload.new_ops_pubkey, 'Copied public key')}
                    >
                      <DocumentDuplicateIcon className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>
                {rotationModal.result.generated_ops_key_pair ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Update your backend environment with the generated key pair below, then restart the backend services.
                    </p>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">OPS_ED25519_PRIVATE_KEY_B64</div>
                      <div className="mt-1 flex items-center gap-3 flex-wrap">
                        <code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 break-all">
                          {rotationModal.result.generated_ops_key_pair.private_key_b64}
                        </code>
                        <button
                          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                          onClick={() => copyToClipboard(rotationModal.result!.generated_ops_key_pair!.private_key_b64, 'Copied private key')}
                        >
                          <DocumentDuplicateIcon className="h-4 w-4" />
                          Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">OPS_ED25519_PUBLIC_KEY_B64</div>
                      <div className="mt-1 flex items-center gap-3 flex-wrap">
                        <code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 break-all">
                          {rotationModal.result.generated_ops_key_pair.public_key_b64}
                        </code>
                        <button
                          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                          onClick={() => copyToClipboard(rotationModal.result!.generated_ops_key_pair!.public_key_b64, 'Copied public key')}
                        >
                          <DocumentDuplicateIcon className="h-4 w-4" />
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    You supplied a custom Ops public key. Make sure the backend <code className="font-mono">OPS_ED25519_PRIVATE_KEY_B64</code> env var matches the private key you generated for it, then restart the backend.
                  </p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Command signed at {formatUtcDateTime(rotationModal.result.payload.ts * 1000)}.
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <button className="btn-primary" onClick={handleCloseRotationModal}>
              Close
            </button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );

  // Render Devtools/Diagnostics Tab
  const renderDevtoolsTab = () => {
    if (!gateway) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center py-8">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Bind a gateway via Swap / Recovery to use diagnostics. Connection status and endpoints are on the Overview tab.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Secure Time Sync */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
            <ClockIcon className="h-5 w-5 mr-2" />
            Secure Time Sync
          </h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await apiService.getSecureTimeSyncPacket();
                  // Decode JWT to show timestamp (JWT format: header.payload.signature)
                  const payload = res.timeSyncJwt ? JSON.parse(atob(res.timeSyncJwt.split('.')[1])) : null;
                  addToast({ type: 'success', title: `Time Sync ts=${payload?.ts || 'unknown'}` });
                } catch {
                  addToast({ type: 'error', title: 'Failed to get time sync packet' });
                }
              }}
              className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              Get Secure Time
            </button>
            <button
              onClick={async () => {
                const values = await openPrompt({
                  title: 'Request Time Sync (Lock)',
                  fields: [{ key: 'lockId', label: 'Lock ID', required: true }],
                });
                if (!values?.lockId?.trim()) return;
                try {
                  const res = await apiService.requestTimeSyncForLock(values.lockId.trim());
                  const payload = res.timeSyncJwt ? JSON.parse(atob(res.timeSyncJwt.split('.')[1])) : null;
                  addToast({ type: 'success', title: `Time Sync (lock) ts=${payload?.ts || 'unknown'}` });
                } catch {
                  addToast({ type: 'error', title: 'Failed to request time sync for lock' });
                }
              }}
              className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800"
            >
              Request Time Sync (Lock)
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Locks reject older timestamps to prevent time rollback.
          </p>
        </div>

        {/* Gateway Commands Test (DEV_ADMIN only) */}
        {isDevAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <WrenchScrewdriverIcon className="h-5 w-5 mr-2" />
              Gateway Commands (Test)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Send test commands to the connected gateway. These are for development and testing purposes only.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Denylist Commands */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Denylist Commands</h4>
                <button
                  onClick={async () => {
                    const values = await openPrompt({
                      title: 'DENYLIST_ADD',
                      fields: [
                        { key: 'userId', label: 'User ID', required: true },
                        { key: 'deviceIds', label: 'Device IDs (comma-separated)', required: true },
                      ],
                    });
                    if (!values?.userId?.trim() || !values?.deviceIds?.trim()) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'DENYLIST_ADD',
                        targetDeviceIds: values.deviceIds.split(',').map(id => id.trim()),
                        userId: values.userId.trim(),
                      });
                      addToast({ type: 'success', title: `DENYLIST_ADD sent: ${res.success}` });
                    } catch (err: any) {
                      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to send DENYLIST_ADD' });
                    }
                  }}
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                >
                  DENYLIST_ADD
                </button>
                <button
                  onClick={async () => {
                    const values = await openPrompt({
                      title: 'DENYLIST_REMOVE',
                      fields: [
                        { key: 'userId', label: 'User ID', required: true },
                        { key: 'deviceIds', label: 'Device IDs (comma-separated)', required: true },
                      ],
                    });
                    if (!values?.userId?.trim() || !values?.deviceIds?.trim()) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'DENYLIST_REMOVE',
                        targetDeviceIds: values.deviceIds.split(',').map(id => id.trim()),
                        userId: values.userId.trim(),
                      });
                      addToast({ type: 'success', title: `DENYLIST_REMOVE sent: ${res.success}` });
                    } catch (err: any) {
                      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to send DENYLIST_REMOVE' });
                    }
                  }}
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700"
                >
                  DENYLIST_REMOVE
                </button>
              </div>
              
              {/* Lock/Unlock Commands */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Lock/Unlock Commands</h4>
                <button
                  onClick={async () => {
                    const values = await openPrompt({
                      title: 'LOCK devices',
                      fields: [
                        { key: 'deviceIds', label: 'Device IDs to LOCK (comma-separated)', required: true },
                      ],
                    });
                    if (!values?.deviceIds?.trim()) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'LOCK',
                        targetDeviceIds: values.deviceIds.split(',').map(id => id.trim()),
                      });
                      addToast({ type: 'success', title: `LOCK sent to ${res.targetDeviceIds?.length || 0} device(s)` });
                    } catch (err: any) {
                      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to send LOCK' });
                    }
                  }}
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  LOCK
                </button>
                <button
                  onClick={async () => {
                    const values = await openPrompt({
                      title: 'UNLOCK devices',
                      fields: [
                        { key: 'deviceIds', label: 'Device IDs to UNLOCK (comma-separated)', required: true },
                      ],
                    });
                    if (!values?.deviceIds?.trim()) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'UNLOCK',
                        targetDeviceIds: values.deviceIds.split(',').map(id => id.trim()),
                      });
                      addToast({ type: 'success', title: `UNLOCK sent to ${res.targetDeviceIds?.length || 0} device(s)` });
                    } catch (err: any) {
                      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to send UNLOCK' });
                    }
                  }}
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-sm rounded-md bg-yellow-600 text-white hover:bg-yellow-700"
                >
                  UNLOCK
                </button>
              </div>
            </div>
            
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Commands are signed and sent directly to the gateway WebSocket connection.
            </p>
          </div>
        )}

        {/* Gateway Debug */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Gateway Debug</h3>
          {/* Live WS monitor + ping tester */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">WS Heartbeat / Last Activity</h4>
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last gateway activity</span>
                  <span className="font-mono">
                    {lastGatewayActivityAt
                      ? formatTime(new Date(lastGatewayActivityAt))
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last PING</span>
                  <span className="font-mono">
                    {lastPingTs ? formatTime(new Date(lastPingTs)) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last PONG</span>
                  <span className="font-mono">
                    {lastPongTs ? formatTime(new Date(lastPongTs)) : '—'}
                  </span>
                </div>
                {lastPingTs && lastPongTs && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Last RTT</span>
                    <span className="font-mono">
                      {Math.max(0, lastPongTs - lastPingTs)} ms
                    </span>
                  </div>
                )}
                <button
                  onClick={async () => {
                    try {
                      await apiService.pingGatewayDev(facilityId);
                      addToast({ type: 'success', title: 'Forced PING requested' });
                    } catch (err: any) {
                      const message = err?.response?.data?.message || 'Failed to request gateway PING';
                      addToast({ type: 'error', title: message });
                    }
                  }}
                  disabled={!isDevAdmin}
                  className={`mt-3 inline-flex items-center px-3 py-2 text-sm rounded-md ${
                    isDevAdmin
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Send Test PING
                </button>
                {!isDevAdmin && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Dev Admin required for PING tester.
                  </p>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Live Gateway WS Events</h4>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30 max-h-64 overflow-y-auto text-xs font-mono p-2 space-y-1">
                {gatewayDebugEvents.length === 0 && (
                  <div className="text-gray-500 dark:text-gray-400">
                    No events yet. Once a gateway connects and starts talking, events will appear here.
                  </div>
                )}
                {gatewayDebugEvents
                  .filter((e) => !e.facilityId || e.facilityId === facilityId)
                  .slice(-100)
                  .reverse()
                  .map((event, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {event.ts ? formatTime(event.ts) : ''}
                      </span>
                      <span
                        className={`px-1 rounded ${
                          event.kind === 'ping_sent'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : event.kind === 'pong_received'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : event.kind === 'heartbeat_timeout' || event.kind === 'connection_closed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {event.kind}
                      </span>
                      <span className="truncate">
                        {event.type && <span className="mr-2">type={event.type}</span>}
                        {event.direction && <span className="mr-2">dir={event.direction}</span>}
                        {event.remote && <span className="mr-2">ip={event.remote}</span>}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fallback JWT (App-signed)
              </label>
              <textarea
                value={fallbackJwtInput}
                onChange={(e) => setFallbackJwtInput(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    if (!fallbackJwtInput.trim()) return;
                    try {
                      const res = await apiService.requestFallbackPass(fallbackJwtInput.trim());
                      addToast({ type: res.success ? 'success' : 'error', title: res.success ? 'Fallback pass processed' : 'Fallback failed' });
                    } catch {
                      addToast({ type: 'error', title: 'Fallback request failed' });
                    }
                  }}
                  className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
                >
                  Submit Fallback
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Root Private Key (base64url, 32-byte)
              </label>
              <textarea
                value={rootPrivateKeyInput}
                onChange={(e) => setRootPrivateKeyInput(e.target.value)}
                rows={3}
                placeholder="Example: mX2X9Q0... (no padding)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Only used to sign the rotation packet and never stored.
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-1">
                Custom Ops Public Key (optional)
              </label>
              <textarea
                value={customOpsPublicKeyInput}
                onChange={(e) => setCustomOpsPublicKeyInput(e.target.value)}
                rows={2}
                placeholder="Leave blank to auto-generate a new Ops key pair"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Provide only if you generated a key pair elsewhere. Format: base64url (no padding).
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleOpenRotationModal}
                  disabled={!isDevAdmin}
                  className={`inline-flex items-center px-3 py-2 text-sm rounded-md ${isDevAdmin ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'}`}
                >
                  Rotate Ops Key
                </button>
                {!isDevAdmin && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Dev Admin privileges required
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main return with left nav and tab content
  return (
    <div className="flex gap-6">
      {/* Left Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
          <nav className="space-y-1">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const showRecoveryBadge = tab.id === 'swap-recovery' && hasSwapAlert;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-3 shrink-0" />
                  <span className="flex-1 text-left">{tab.label}</span>
                  {showRecoveryBadge && (
                    <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-[#147FD4] animate-pulse" aria-label="Swap recovery attention required" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-w-0">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'sync' && renderSyncTab()}
        {activeTab === 'inventory-sync' && isPlatformAdmin && gateway && (
          <div className="space-y-4">
            {recoveryBlocking && (
              <RecoveryBlockingBanner message="Inventory sync history is read-only during gateway swap recovery. New syncs are blocked until recovery completes or is bypassed." />
            )}
            <GatewayDeviceSyncHistory
              gatewayId={gateway.id}
              facilityId={facilityId}
              liveEnabled={activeTab === 'inventory-sync'}
            />
          </div>
        )}
        {activeTab === 'inventory-sync' && isPlatformAdmin && !gateway && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Bind a gateway via Swap / Recovery to view inventory sync history.</p>
          </div>
        )}
        {activeTab === 'gateway-logs' && canManageGateway && gateway && (
          <GatewayTelemetryLogsTab
            gatewayId={gateway.id}
            facilityId={facilityId}
            liveEnabled={activeTab === 'gateway-logs'}
          />
        )}
        {activeTab === 'gateway-logs' && canManageGateway && !gateway && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Bind a gateway via Swap / Recovery to view operational telemetry logs.</p>
          </div>
        )}
        {activeTab === 'firmware' && gateway && (
          <GatewayFirmwareTab
            gatewayId={gateway.id}
            currentFirmwareVersion={gateway.firmware_version}
            gatewayModel={gateway.model}
            recoveryBlocking={recoveryBlocking}
          />
        )}
        {activeTab === 'swap-recovery' && canManageGateway && (
          <GatewaySwapRecoveryTab
            facilityId={facilityId}
            boundGatewayId={gateway?.id ?? undefined}
            wsConnected={wsConnected}
            onRecoveryChange={handleRecoveryChange}
          />
        )}
        {activeTab === 'devtools' && renderDevtoolsTab()}
        {renderRotationModal()}
      </div>

      {promptDialog}
    </div>
  );
}

export default FacilityGatewayTab;
