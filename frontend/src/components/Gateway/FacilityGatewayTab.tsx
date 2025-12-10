import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ServerIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  CloudIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/Modal/Modal';
import { getWsBaseUrl } from '@/services/appConfig';
import { UserRole } from '@/types/auth.types';

interface Gateway {
  id: string;
  facility_id: string;
  name: string;
  model?: string;
  firmware_version?: string;
  ip_address?: string;
  mac_address?: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_seen?: Date;
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
  gateway_type?: 'physical' | 'http' | 'simulated';
  connection_url?: string;
  base_url?: string;
  api_key?: string;
  username?: string;
  password?: string;
  protocol_version?: string;
  poll_frequency_ms?: number;
  ignore_ssl_cert?: boolean;
  created_at: Date;
  updated_at: Date;
}

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
}

function FacilityGatewayTab({ facilityId, facilityName }: FacilityGatewayTabProps) {
  const { addToast } = useToast();
  const ws = useWebSocket();

  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [activeTab, setActiveTab] = useState<'overview' | 'sync' | 'devtools'>('overview');
  const [configForm, setConfigForm] = useState({
    gateway_type: 'http' as 'physical' | 'http' | 'simulated',
    base_url: '',
    connection_url: '',
    api_key: '',
    username: 'admin',
    password: '',
    protocol_version: '1.1',
    poll_frequency_ms: 30000,
    ignore_ssl_cert: false
  });

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
  const isDevAdmin = authState.user?.role === UserRole.DEV_ADMIN;

  // Inbound WS status (gateway connects to cloud)
  const [wsStatus, setWsStatus] = useState<{ connected: boolean; lastPongAt?: number } | null>(null);
  // Gateway debug stream (DEV tools)
  const [gatewayDebugEvents, setGatewayDebugEvents] = useState<any[]>([]);
  const [lastGatewayActivityAt, setLastGatewayActivityAt] = useState<number | null>(null);
  const [lastPingTs, setLastPingTs] = useState<number | null>(null);
  const [lastPongTs, setLastPongTs] = useState<number | null>(null);
  const gatewayWsUrl = useMemo(() => {
    const base = getWsBaseUrl();
    return `${base}/ws/gateway`;
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

  useEffect(() => {
    let timer: any;
    const poll = async () => {
      try {
        const res = await apiService.getGatewayWsStatus(facilityId);
        if (res?.success) setWsStatus({ connected: !!res.connected, lastPongAt: res.lastPongAt });
      } catch {
        setWsStatus(null);
      }
    };
    poll();
    timer = setInterval(poll, 5000);
    return () => { if (timer) clearInterval(timer); };
  }, [facilityId]);

  // Subscribe to gateway debug WS stream (DEV admin only)
  useEffect(() => {
    if (!ws || !isDevAdmin) return;

    const subscriptionId = ws.subscribe(
      'gateway_debug',
      (event: any) => {
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
      undefined // no error handler needed
    );

    return () => {
      if (subscriptionId) {
        ws.unsubscribe(subscriptionId);
      }
    };
  }, [ws, facilityId, isDevAdmin]);

  // Check if gateway is properly configured
  const isGatewayProperlyConfigured = (gw: Gateway | null) => {
    if (!gw || !gw.gateway_type) return false;

    switch (gw.gateway_type) {
      case 'http':
        return !!(gw.base_url && gw.base_url.trim().length > 0);
      case 'physical':
        return !!(gw.connection_url && gw.connection_url.trim().length > 0);
      case 'simulated':
        return true; // Simulated gateways are always "configured"
      default:
        return false;
    }
  };

  useEffect(() => {
    loadGateway();
  }, [facilityId]);

  const loadGateway = async () => {
    try {
      setLoading(true);
      const response = await apiService.getGateways({ facility_id: facilityId });
      const facilityGateways = response.gateways || [];
      if (facilityGateways.length > 0) {
        const gw = facilityGateways[0];
        setGateway(gw);
        setConfigForm({
          gateway_type: gw.gateway_type || 'http',
          base_url: gw.base_url || '',
          connection_url: gw.connection_url || '',
          api_key: gw.api_key || '',
          username: gw.username || 'admin',
          password: '', // Don't populate password
          protocol_version: gw.protocol_version || '1.1',
          poll_frequency_ms: gw.poll_frequency_ms || 30000,
          ignore_ssl_cert: gw.ignore_ssl_cert || false
        });
      }
    } catch (error) {
      console.error('Failed to load gateway:', error);
      addToast({ type: 'error', title: 'Failed to load gateway configuration' });
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to realtime gateway status updates for local state only
  useEffect(() => {
    if (!ws) return;

    const subscriptionId = ws.subscribe(
      'gateway_status',
      (data: any) => {
        try {
          const gateways = data?.gateways || [];
          gateways.forEach((g: any) => {
            // Update local gateway state only (toasts are handled by app-wide listener)
            setGateway(prevGw => (prevGw && prevGw.id === g.id ? { ...prevGw, status: g.status as any, last_seen: g.lastSeen as any } : prevGw));
          });
        } catch (e) {
          console.error('Failed to process gateway status update', e);
        }
      },
      undefined // no error handler needed
    );

    return () => {
      if (subscriptionId) ws.unsubscribe(subscriptionId);
    };
  }, [ws]);

  const handleManualSync = async () => {
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

  const renderGatewayModeInfo = () => {
    if (!gateway) return null;
    if (gateway.gateway_type === 'physical') {
      const apiBase = getWsBaseUrl();
      const token = localStorage.getItem('authToken') || '<FACILITY_ADMIN_JWT>';
      const wsUrl = `${apiBase}/ws/gateway?token=${token}`;
      return (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-sm">
          <p className="text-gray-700 dark:text-gray-300 mb-2">WebSocket gateway connection URL:</p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 break-all">{wsUrl}</code>
            <button
              onClick={() => copyToClipboard(wsUrl, 'Copied WebSocket URL')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              aria-label="Copy WebSocket URL"
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
              Copy URL
            </button>
          </div>
        </div>
      );
    }
    if (gateway.gateway_type === 'http') {
      return (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-sm">
          <p className="text-gray-700 dark:text-gray-300">HTTP gateway uses polling for updates (denylists/time sync). Poll interval: {configForm.poll_frequency_ms} ms.</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading gateway configuration...</span>
      </div>
    );
  }

  // Navigation tabs
  const navTabs = [
    { id: 'overview' as const, label: 'Overview', icon: InformationCircleIcon },
    { id: 'sync' as const, label: 'Sync', icon: CloudIcon },
    { id: 'devtools' as const, label: 'DevTools/Diag', icon: WrenchScrewdriverIcon },
  ];

  // Render Overview Tab
  const renderOverviewTab = () => {
    if (!gateway) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center py-8">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Gateway Configured</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This facility doesn't have a gateway configured yet.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Inbound Gateway Connection</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Gateways connect to the cloud WebSocket and authenticate using an Admin/Dev Admin JWT, or a Facility Admin JWT scoped to this facility.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">WebSocket URL</div>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                <code className="font-mono text-sm text-gray-900 dark:text-white break-all px-2 py-1 bg-gray-50 dark:bg-gray-900/40 rounded border border-gray-200 dark:border-gray-700">
                  {gatewayWsUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(gatewayWsUrl)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Copy WebSocket URL"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                  Copy URL
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Facility ID</div>
              <div className="mt-1 font-mono text-sm text-gray-900 dark:text-white">{facilityId}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Facility Name</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white break-words">{facilityName}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center space-x-3">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${wsStatus?.connected ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'}`}>
              {wsStatus?.connected ? 'Connected' : 'Disconnected'}
            </span>
            {wsStatus?.lastPongAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Last heartbeat: {new Date(wsStatus.lastPongAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Gateway Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Basic Information</h4>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt>
                <dd className="mt-1">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    gateway.gateway_type === 'simulated' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                    gateway.status === 'online' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                    gateway.status === 'offline' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                    gateway.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                  }`}>
                    {gateway.gateway_type === 'simulated' ? 'SIMULATED' : gateway.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500 dark:text-gray-400">Gateway Type</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {gateway.gateway_type === 'http' ? 'HTTP (Mesh Manager API)' :
                   gateway.gateway_type === 'physical' ? 'Physical (WebSocket)' :
                   gateway.gateway_type === 'simulated' ? 'Simulated (Testing)' :
                   'Unknown'}
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
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Firmware Version</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.firmware_version}</dd>
                </div>
              )}
            </dl>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Connection Details</h4>
            <dl className="space-y-3">
              {gateway.ip_address && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">IP Address</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{gateway.ip_address}</dd>
                </div>
              )}
              {gateway.mac_address && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">MAC Address</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{gateway.mac_address}</dd>
                </div>
              )}
              {gateway.base_url && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Base URL</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono break-all">{gateway.base_url}</dd>
                </div>
              )}
              {gateway.connection_url && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Connection URL</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono break-all">{gateway.connection_url}</dd>
                </div>
              )}
              {gateway.last_seen && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Last Seen</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {new Date(gateway.last_seen).toLocaleString()}
                  </dd>
                </div>
              )}
              {gateway.protocol_version && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Protocol Version</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.protocol_version}</dd>
                </div>
              )}
              {gateway.poll_frequency_ms && (
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Poll Frequency</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{gateway.poll_frequency_ms} ms</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            {isGatewayProperlyConfigured(gateway) ? (
              <>
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                Gateway is properly configured
              </>
            ) : (
              <>
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-2" />
                Gateway needs setup configuration
              </>
            )}
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
              Gateway must be configured before syncing.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Sync Now Button */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Manual Synchronization</h3>
          {renderGatewayModeInfo()}
          <button
            onClick={handleManualSync}
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
            Sync will fetch latest data from gateway devices
          </p>
          {lastSyncTime && (
            <div className="mt-4 flex items-center text-sm text-gray-600 dark:text-gray-400">
              <ClockIcon className="h-4 w-4 mr-2" />
              Last sync: {lastSyncTime.toLocaleString()}
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
                      {log.timestamp.toLocaleTimeString()}
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
                  Command signed at {new Date(rotationModal.result.payload.ts * 1000).toLocaleString()} (UTC).
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
              Gateway must be configured to use diagnostics tools.
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
                const lockId = prompt('Enter lock id');
                if (!lockId) return;
                try {
                  const res = await apiService.requestTimeSyncForLock(lockId);
                  // Decode JWT to show timestamp
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
                    const userId = prompt('Enter user ID to add to denylist:');
                    if (!userId) return;
                    const deviceIds = prompt('Enter device IDs (comma-separated):');
                    if (!deviceIds) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'DENYLIST_ADD',
                        targetDeviceIds: deviceIds.split(',').map(id => id.trim()),
                        userId,
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
                    const userId = prompt('Enter user ID to remove from denylist:');
                    if (!userId) return;
                    const deviceIds = prompt('Enter device IDs (comma-separated):');
                    if (!deviceIds) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'DENYLIST_REMOVE',
                        targetDeviceIds: deviceIds.split(',').map(id => id.trim()),
                        userId,
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
                    const deviceIds = prompt('Enter device IDs to LOCK (comma-separated):');
                    if (!deviceIds) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'LOCK',
                        targetDeviceIds: deviceIds.split(',').map(id => id.trim()),
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
                    const deviceIds = prompt('Enter device IDs to UNLOCK (comma-separated):');
                    if (!deviceIds) return;
                    try {
                      const res = await apiService.sendGatewayCommand({
                        facilityId,
                        command: 'UNLOCK',
                        targetDeviceIds: deviceIds.split(',').map(id => id.trim()),
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
                      ? new Date(lastGatewayActivityAt).toLocaleTimeString()
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last PING</span>
                  <span className="font-mono">
                    {lastPingTs ? new Date(lastPingTs).toLocaleTimeString() : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last PONG</span>
                  <span className="font-mono">
                    {lastPongTs ? new Date(lastPongTs).toLocaleTimeString() : '—'}
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
                        {event.ts ? new Date(event.ts).toLocaleTimeString() : ''}
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
                  <Icon className="h-5 w-5 mr-3" />
                  {tab.label}
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
        {activeTab === 'devtools' && renderDevtoolsTab()}
        {renderRotationModal()}
      </div>
    </div>
  );
}

export default FacilityGatewayTab;
