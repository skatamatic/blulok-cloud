import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ServerIcon,
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CloudIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  DocumentDuplicateIcon,
  CpuChipIcon,
  DocumentTextIcon,
  PencilIcon,
  ArrowRightOnRectangleIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';
import GatewayFirmwareTab from './GatewayFirmwareTab';
import { useFacilityGatewayRecovery } from '@/hooks/useFacilityGatewayRecovery';
import GatewaySwapRecoveryTab from './GatewaySwapRecoveryTab';
import RecoveryBlockingBanner from './RecoveryBlockingBanner';
import { GatewayDeviceSyncHistory } from './GatewayDeviceSyncHistory';
import { GatewayManualSyncPanel } from './GatewayManualSyncPanel';
import { GatewayTelemetryLogsTab } from './GatewayTelemetryLogsTab';
import { GatewaySessionTraceTab } from './GatewaySessionTraceTab';
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
import { getApiErrorMessage } from '@/utils/apiError.utils';

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

  const [editingGatewayName, setEditingGatewayName] = useState(false);
  const [gatewayNameDraft, setGatewayNameDraft] = useState('');
  const [savingGatewayName, setSavingGatewayName] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'sync' | 'inventory-sync' | 'gateway-logs' | 'session-trace' | 'firmware' | 'swap-recovery' | 'devtools'>('overview');

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
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
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
  } = useFacilityGatewayRecovery(facilityId, canManageGateway);

  const isZtpGateway = Boolean(gateway?.public_key);

  useEffect(() => {
    if (!editingGatewayName) {
      setGatewayNameDraft(gateway?.name ?? '');
    }
  }, [editingGatewayName, gateway?.name]);

  const saveGatewayName = useCallback(async () => {
    if (!gateway || savingGatewayName) return;
    const name = gatewayNameDraft.trim();
    if (!name) {
      addToast({ type: 'error', title: 'Gateway name is required' });
      return;
    }
    if (name === gateway.name) {
      setEditingGatewayName(false);
      return;
    }

    setSavingGatewayName(true);
    try {
      await apiService.updateGateway(gateway.id, { name });
      await reload();
      setEditingGatewayName(false);
      addToast({ type: 'success', title: 'Gateway renamed' });
    } catch (error: unknown) {
      addToast({
        type: 'error',
        title: getApiErrorMessage(error, 'Failed to rename gateway'),
      });
    } finally {
      setSavingGatewayName(false);
    }
  }, [addToast, gateway, gatewayNameDraft, reload, savingGatewayName]);

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

  const handleReleaseGateway = useCallback(async () => {
    if (!gateway || releasing) return;
    setReleasing(true);
    try {
      await apiService.releaseGateway(gateway.id);
      addToast({
        type: 'success',
        title: 'Gateway released',
        message: 'Assign a gateway when you need remote control again.',
      });
      setReleaseModalOpen(false);
      await reload();
      void refetchRecoverySummary();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Release failed',
        message: getApiErrorMessage(error, 'Could not release this gateway'),
      });
    } finally {
      setReleasing(false);
    }
  }, [addToast, gateway, refetchRecoverySummary, releasing, reload]);

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
                  ? 'Inventory sync and remote lock commands stay blocked until recovery finishes or is bypassed.'
                  : 'A replacement gateway is online. Review Swap / Recovery before treating its inventory as current.'}
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
    ...(canManageGateway
      ? [{ id: 'session-trace' as const, label: 'Session trace', icon: ViewfinderCircleIcon }]
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
              <p className="font-medium">Gateway connected, but not assigned yet</p>
              <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
                A gateway is talking to this facility, but none is assigned. Open{' '}
                <strong className="font-semibold">Swap / Recovery</strong> to finish setup, or contact BluLok for help.
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
              This facility does not have a gateway yet. Power it on, then use{' '}
              <strong className="font-semibold">Swap / Recovery</strong> to assign it. Contact BluLok if you need setup help.
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
          Use these URLs in your gateway config (same as <code className="text-xs">CLOUD_WS</code> and{' '}
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
                <dd className="mt-1">
                  {editingGatewayName ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveGatewayName();
                      }}
                    >
                      <label htmlFor="gateway-display-name" className="sr-only">Gateway name</label>
                      <input
                        id="gateway-display-name"
                        value={gatewayNameDraft}
                        onChange={(event) => setGatewayNameDraft(event.target.value)}
                        maxLength={255}
                        autoFocus
                        disabled={savingGatewayName}
                        className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={savingGatewayName || !gatewayNameDraft.trim()}
                        className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingGatewayName ? 'Savingâ€¦' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={savingGatewayName}
                        onClick={() => {
                          setGatewayNameDraft(gateway.name);
                          setEditingGatewayName(false);
                        }}
                        className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {gateway.name}
                      </span>
                      {canManageGateway && (
                        <button
                          type="button"
                          onClick={() => setEditingGatewayName(true)}
                          aria-label="Rename gateway"
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-300"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </dd>
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

        {canManageGateway && isZtpGateway && (
          <div className="rounded-lg border border-red-200 bg-red-50/70 p-6 dark:border-red-900/50 dark:bg-red-950/20">
            <h3 className="text-lg font-medium text-red-900 dark:text-red-100">Release gateway</h3>
            <p className="mt-2 text-sm text-red-900/80 dark:text-red-200/80">
              Removes this gateway from <strong>{facilityName}</strong>. Remote lock and access control
              stop for this site until you assign another gateway. Devices and units stay in place.
            </p>
            <button
              type="button"
              onClick={() => setReleaseModalOpen(true)}
              className="btn-danger mt-4 inline-flex items-center gap-2"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden />
              Release from facility
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderReleaseModal = () => (
    <Modal
      isOpen={releaseModalOpen}
      onClose={() => {
        if (releasing) return;
        setReleaseModalOpen(false);
      }}
      size="md"
      showCloseButton={!releasing}
    >
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Release {gateway?.name ?? 'gateway'} from {facilityName}?
        </h3>
      </ModalHeader>
      <ModalBody>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Remote control for this facility will stop until another gateway is assigned. Your units
          and devices are kept.
        </p>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          After release, set up the same hardware again or install a replacement.
        </p>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn-secondary"
          disabled={releasing}
          onClick={() => setReleaseModalOpen(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={releasing}
          onClick={() => void handleReleaseGateway()}
        >
          {releasing ? 'Releasingâ€¦' : 'Release gateway'}
        </button>
      </ModalFooter>
    </Modal>
  );

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
              <li>Keep the root private key secure. It only signs this packet and is never stored.</li>
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
              Commands are signed and sent to the connected gateway.
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
                      : 'â€”'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last PING</span>
                  <span className="font-mono">
                    {lastPingTs ? formatTime(new Date(lastPingTs)) : 'â€”'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last PONG</span>
                  <span className="font-mono">
                    {lastPongTs ? formatTime(new Date(lastPongTs)) : 'â€”'}
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
                    No events yet. Events appear when a gateway connects.
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
                Fallback token (app-signed)
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
        {activeTab === 'sync' && (
          <GatewayManualSyncPanel
            gateway={gateway ? { id: gateway.id } : null}
            facilityId={facilityId}
            recoveryBlocking={recoveryBlocking}
            isPlatformAdmin={isPlatformAdmin}
            onNavigateToInventorySync={() => setActiveTab('inventory-sync')}
            copyToClipboard={copyToClipboard}
          />
        )}
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
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No gateway is assigned to this facility yet.
          </div>
        )}
        {activeTab === 'session-trace' && canManageGateway && gateway && (
          <GatewaySessionTraceTab
            gatewayId={gateway.id}
            facilityId={facilityId}
            liveEnabled={activeTab === 'session-trace'}
          />
        )}
        {activeTab === 'session-trace' && canManageGateway && !gateway && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No gateway is assigned to this facility yet.
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
        {renderReleaseModal()}
      </div>

      {promptDialog}
    </div>
  );
}

export default FacilityGatewayTab;
