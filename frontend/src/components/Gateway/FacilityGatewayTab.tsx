import { useState, useEffect } from 'react';
import {
  ServerIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  WifiIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  CloudIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';

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

interface FacilityGatewayTabProps {
  facilityId: string;
  facilityName: string;
  canManageGateway: boolean;
}

function FacilityGatewayTab({ facilityId, facilityName, canManageGateway }: FacilityGatewayTabProps) {
  const { addToast } = useToast();
  const ws = useWebSocket();

  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
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
  const [activeTab, setActiveTab] = useState<'overview' | 'setup' | 'sync' | 'devtools'>('overview');
  const [configExpanded, setConfigExpanded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
  const [rotationPayloadInput, setRotationPayloadInput] = useState('');
  const [rotationSignatureInput, setRotationSignatureInput] = useState('');
  const { authState } = useAuth();

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

    const subscriptionId = ws.subscribe('gateway_status', (data: any) => {
      try {
        const gateways = data?.gateways || [];
        gateways.forEach((g: any) => {
          // Update local gateway state only (toasts are handled by app-wide listener)
          setGateway(prevGw => (prevGw && prevGw.id === g.id ? { ...prevGw, status: g.status as any, last_seen: g.lastSeen as any } : prevGw));
        });
      } catch (e) {
        console.error('Failed to process gateway status update', e);
      }
    });

    return () => {
      if (subscriptionId) ws.unsubscribe(subscriptionId);
    };
  }, [ws]);

  const handleTestConnection = async () => {
    console.log('handleTestConnection called');
    if (!gateway) {
      console.error('No gateway selected');
      addToast({ type: 'error', title: 'No gateway selected' });
      return;
    }

    console.log('Testing connection for gateway:', gateway.id, gateway);

    // Validate gateway has required fields for HTTP
    if (gateway.gateway_type === 'http') {
      if (!gateway.base_url || gateway.base_url.trim() === '') {
        addToast({ type: 'error', title: 'Gateway base URL is required for connection test' });
        return;
      }
    }

    setTestingConnection(true);
    try {
      console.log('Making API call to test connection...');
      const result = await apiService.testGatewayConnection(gateway.id);
      console.log('Connection test result:', result);
      // Keep toast concise and consistent
      addToast({ type: 'success', title: 'Gateway connection test successful' });
    } catch (error: any) {
      console.error('Connection test failed:', error);
      console.error('Error response:', error?.response);
      console.error('Error message:', error?.message);

      let message = 'Gateway lock fetch failed';

      if (error?.response?.data?.message) {
        message = error.response.data.message;
      } else if (error?.response?.status) {
        message = `Lock fetch failed (HTTP ${error.response.status})`;
      } else if (error?.message) {
        message = `Connection failed: ${error.message}`;
      } else if (error?.code === 'NETWORK_ERROR') {
        message = 'Network error: Cannot reach gateway. Please check the URL and network connection.';
      }

      addToast({ type: 'error', title: message });
    } finally {
      // Clear flag after a short delay to catch any lingering status updates
      setTimeout(() => setTestingConnection(false), 2000);
    }
  };

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
      const apiBase = (globalThis as any).import?.meta?.env?.VITE_WS_URL || 'ws://localhost:3000';
      const token = localStorage.getItem('authToken') || '<FACILITY_ADMIN_JWT>';
      const wsUrl = `${apiBase}/ws/gateway?token=${token}`;
      return (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-sm">
          <p className="text-gray-700 dark:text-gray-300 mb-2">WebSocket gateway connection URL:</p>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 break-all">{wsUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(wsUrl); addToast({ type: 'success', title: 'Copied WS URL' }); }} className="px-2 py-1 bg-gray-700 text-white rounded">
              Copy
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

  const handleSaveConfiguration = async () => {
    try {
      const updateData = {
        gateway_type: configForm.gateway_type,
        base_url: configForm.base_url,
        connection_url: configForm.connection_url,
        api_key: configForm.api_key,
        username: configForm.username,
        password: configForm.password || undefined, // Only update if provided
        protocol_version: configForm.protocol_version,
        poll_frequency_ms: configForm.poll_frequency_ms,
        ignore_ssl_cert: configForm.ignore_ssl_cert
      };

      if (gateway) {
        await apiService.updateGateway(gateway.id, updateData);
        addToast({ type: 'success', title: 'Gateway configuration updated successfully' });
        loadGateway();
      } else {
        const createData = {
          ...updateData,
          facility_id: facilityId,
          name: `${facilityName} Gateway`
        };
        await apiService.createGateway(createData);
        addToast({ type: 'success', title: 'Gateway created successfully' });
        loadGateway();
      }

      setConfigExpanded(false);
    } catch (error) {
      console.error('Failed to save configuration:', error);
      addToast({ type: 'error', title: 'Failed to save gateway configuration' });
    }
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
    { id: 'setup' as const, label: 'Setup', icon: Cog6ToothIcon },
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
            {canManageGateway && (
              <button
                onClick={() => setActiveTab('setup')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                <Cog6ToothIcon className="h-4 w-4 mr-2" />
                Configure Gateway
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
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
    );
  };

  // Render Setup Tab
  const renderSetupTab = () => {
    if (!gateway && !canManageGateway) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center py-8">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Gateway Configured</h3>
            <p className="text-gray-600 dark:text-gray-400">
              You don't have permission to configure gateways.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        {gateway ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Gateway Configuration
              </h3>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                isGatewayProperlyConfigured(gateway) 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
              }`}>
                {isGatewayProperlyConfigured(gateway) ? 'Configured' : 'Needs Setup'}
              </span>
            </div>
            {canManageGateway && (
              <>
                {!configExpanded && (
                  <button
                    onClick={() => setConfigExpanded(true)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 mb-4"
                  >
                    <ChevronDownIcon className="h-4 w-4 inline mr-2" />
                    Show Configuration
                  </button>
                )}
                {configExpanded && (
                  <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Gateway Type
                </label>
                <select
                  value={configForm.gateway_type}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, gateway_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="http">HTTP (Mesh Manager API)</option>
                  <option value="physical">Physical (WebSocket)</option>
                  <option value="simulated">Simulated (Testing)</option>
                </select>
              </div>

              {configForm.gateway_type === 'http' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Base URL
                    </label>
                    <input
                      type="url"
                      value={configForm.base_url}
                      onChange={(e) => setConfigForm(prev => ({ ...prev, base_url: e.target.value }))}
                      placeholder="https://mesh-manager.example.com/api"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={configForm.api_key}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, api_key: e.target.value }))}
                        className="w-full pr-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showApiKey ? (
                          <EyeSlashIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={configForm.username}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={configForm.password}
                          onChange={(e) => setConfigForm(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Leave empty to keep current"
                          className="w-full pr-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showPassword ? (
                            <EyeSlashIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Poll Frequency (ms)
                    </label>
                    <input
                      type="number"
                      value={configForm.poll_frequency_ms}
                      onChange={(e) => setConfigForm(prev => ({ ...prev, poll_frequency_ms: parseInt(e.target.value) || 30000 }))}
                      min="5000"
                      max="300000"
                      step="5000"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      How often to poll for updates (5-300 seconds)
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="ignore_ssl_cert"
                      checked={configForm.ignore_ssl_cert}
                      onChange={(e) => setConfigForm(prev => ({ ...prev, ignore_ssl_cert: e.target.checked }))}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="ignore_ssl_cert" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      <div className="flex items-center">
                        <ShieldCheckIcon className="h-4 w-4 mr-1 text-primary-500" />
                        Ignore SSL Certificate Errors
                      </div>
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-6">
                    Allow connections to gateways with self-signed or invalid SSL certificates (useful for testing)
                  </p>
                </>
              )}

              {configForm.gateway_type === 'physical' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Connection URL
                  </label>
                  <input
                    type="url"
                    value={configForm.connection_url}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, connection_url: e.target.value }))}
                    placeholder="ws://gateway.example.com:8080"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Protocol Version
                </label>
                <select
                  value={configForm.protocol_version}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, protocol_version: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="1.0">1.0</option>
                  <option value="1.1">1.1</option>
                  <option value="2.0">2.0</option>
                  <option value="simulated">Simulated</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={handleSaveConfiguration}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {gateway ? 'Update Configuration' : 'Create Gateway'}
                </button>
              </div>

              {/* Configuration Status and Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setConfigExpanded(false)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <ChevronUpIcon className="h-4 w-4 inline mr-1" />
                  Hide Configuration
                </button>
                {gateway && (
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {testingConnection ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 mr-2"></div>
                        Testing...
                      </>
                    ) : (
                      <>
                        <WifiIcon className="h-4 w-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
          </>
        )}
      </>
    ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center py-8">
            <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Gateway Configured</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This facility doesn't have a gateway configured yet.
            </p>
            {canManageGateway && (
              <button
                onClick={() => setConfigExpanded(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                <Cog6ToothIcon className="h-4 w-4 mr-2" />
                Configure Gateway
              </button>
            )}
          </div>
          {configExpanded && canManageGateway && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4 text-left">
              {/* Reuse the same form (without Test Connection for non-existent gateway) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Gateway Type</label>
                <select
                  value={configForm.gateway_type}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, gateway_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="http">HTTP (Mesh Manager API)</option>
                  <option value="physical">Physical (WebSocket)</option>
                  <option value="simulated">Simulated (Testing)</option>
                </select>
              </div>

              {configForm.gateway_type === 'http' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
                    <input type="url" value={configForm.base_url} onChange={(e) => setConfigForm(prev => ({ ...prev, base_url: e.target.value }))}
                      placeholder="https://mesh-manager.example.com/api"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                    <div className="relative">
                      <input type={showApiKey ? "text" : "password"} value={configForm.api_key} onChange={(e) => setConfigForm(prev => ({ ...prev, api_key: e.target.value }))}
                        className="w-full pr-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showApiKey ? (
                          <EyeSlashIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {configForm.gateway_type === 'physical' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Connection URL
                  </label>
                  <input
                    type="url"
                    value={configForm.connection_url}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, connection_url: e.target.value }))}
                    placeholder="ws://gateway.example.com:8080"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={handleSaveConfiguration} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                  Create Gateway
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        Device: {device.serial || device.id}
                      </h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        device.locked ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}>
                        {device.locked ? 'Locked' : 'Unlocked'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Battery: {device.batteryLevel}%
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
                      <span className="text-gray-500 dark:text-gray-400">ID:</span>
                      <span className="ml-1 font-medium font-mono text-xs">{device.id}</span>
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
                  addToast({ type: 'success', title: `Time Sync ts=${res.timeSyncPacket?.[0]?.ts}` });
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
                  addToast({ type: 'success', title: `Time Sync (lock) ts=${res.timeSyncPacket?.[0]?.ts}` });
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

        {/* Gateway Debug */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Gateway Debug</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                Rotation Payload (Root-signed)
              </label>
              <textarea
                value={rotationPayloadInput}
                onChange={(e) => setRotationPayloadInput(e.target.value)}
                rows={3}
                placeholder='{"cmd_type":"ROTATE_OPERATIONS_KEY","new_ops_pubkey":"...","ts":1234567890}'
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-2 mb-1">
                Signature (base64url)
              </label>
              <input
                value={rotationSignatureInput}
                onChange={(e) => setRotationSignatureInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <div className="mt-2 flex gap-2">
                {['dev_admin'].includes(authState.user?.role || '') && (
                  <button
                    onClick={async () => {
                      try {
                        const payload = JSON.parse(rotationPayloadInput);
                        const signature = rotationSignatureInput.trim();
                        if (!payload?.cmd_type || !signature) throw new Error('Invalid input');
                        const res = await apiService.broadcastOpsKeyRotation(payload, signature);
                        addToast({ type: res.success ? 'success' : 'error', title: res.success ? 'Rotation broadcasted' : 'Rotation failed' });
                      } catch {
                        addToast({ type: 'error', title: 'Invalid rotation packet or request failed' });
                      }
                    }}
                    className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800"
                  >
                    Broadcast Rotation
                  </button>
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
        {activeTab === 'setup' && renderSetupTab()}
        {activeTab === 'sync' && renderSyncTab()}
        {activeTab === 'devtools' && renderDevtoolsTab()}
      </div>
    </div>
  );
}

export default FacilityGatewayTab;
