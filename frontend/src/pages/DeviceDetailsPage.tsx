import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import {
  ArrowLeftIcon,
  LockClosedIcon,
  LockOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  Battery50Icon,
  Battery100Icon,
  UserIcon,
  ShieldExclamationIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';

interface DeviceDetails {
  id: string;
  device_serial: string;
  unit_id?: string;
  unit_number?: string;
  facility_id: string;
  facility_name: string;
  lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
  last_activity?: string;
  firmware_version?: string;
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface DenylistEntry {
  id: string;
  device_id: string;
  user_id: string;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
  source: 'user_deactivation' | 'unit_unassignment' | 'fms_sync' | 'key_sharing_revocation';
  user: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  };
}

type TabType = 'overview' | 'denylist' | 'diagnostics';

const statusColors = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
};

const lockStatusColors: Record<DeviceDetails['lock_status'], string> = {
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  locking: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 animate-pulse',
  unlocking: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 animate-pulse',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

const sourceLabels = {
  user_deactivation: 'User Deactivated',
  unit_unassignment: 'Unit Unassigned',
  fms_sync: 'FMS Sync',
  key_sharing_revocation: 'Key Sharing Revoked',
};

export default function DeviceDetailsPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const { authState } = useAuth();
  const [device, setDevice] = useState<DeviceDetails | null>(null);
  const [denylistEntries, setDenylistEntries] = useState<DenylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDenylist, setLoadingDenylist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Handle tab from URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['overview', 'denylist', 'diagnostics'].includes(tabParam)) {
      setActiveTab(tabParam as TabType);
    }
  }, []);

  useEffect(() => {
    if (deviceId) {
      loadDeviceDetails();
      if (activeTab === 'denylist') {
        loadDenylist();
      }
    }
  }, [deviceId, activeTab]);

  const loadDeviceDetails = async () => {
    if (!deviceId) return;

    try {
      setLoading(true);
      setError(null);
      
      // Load single device details directly to avoid backend filter issues
      const response = await apiService.getBluLokDevice(deviceId);
      if (!response?.device) {
        setError('Device not found');
        return;
      }
      setDevice(response.device);
    } catch (error: any) {
      console.error('Failed to load device details:', error);
      setError(error?.response?.data?.message || 'Failed to load device details');
      addToast({
        type: 'error',
        title: 'Failed to load device details',
        message: error?.response?.data?.message || 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDenylist = async () => {
    if (!deviceId) return;

    try {
      setLoadingDenylist(true);
      const response = await apiService.getDeviceDenylist(deviceId);
      setDenylistEntries(response.entries || []);
    } catch (error: any) {
      console.error('Failed to load denylist:', error);
      addToast({
        type: 'error',
        title: 'Failed to load denylist',
        message: error?.response?.data?.message || 'An unexpected error occurred',
      });
    } finally {
      setLoadingDenylist(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());

    if (tab === 'denylist' && denylistEntries.length === 0) {
      loadDenylist();
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Permanent';
    const date = new Date(dateString);
    const now = new Date();
    const isExpired = date < now;
    return (
      <span className={isExpired ? 'text-red-600 dark:text-red-400' : ''}>
        {date.toLocaleString()}
        {isExpired && ' (Expired)'}
      </span>
    );
  };

  const getTimeUntilExpiration = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return '< 1 hour';
  };

  const backTarget = (() => {
    const state = (location.state as any) || {};
    if (state.from === 'facility' && state.facilityId) {
      return `/facilities/${state.facilityId}`;
    }
    if (state.from === 'devices') {
      return '/devices';
    }
    return '/devices';
  })();

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate(backTarget)}
          className="mb-4 inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back
        </button>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-400">{error || 'Device not found'}</p>
        </div>
      </div>
    );
  }

  const BatteryIcon = device.battery_level !== undefined && device.battery_level < 20 
    ? Battery50Icon 
    : Battery100Icon;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(backTarget)}
          className="mb-4 inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Device Details
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {device.device_serial}
              {device.unit_number && ` • Unit ${device.unit_number}`}
            </p>
          </div>
          {canManage && (
            <div>
              <button
                onClick={async () => {
                  try {
                    const targetStatus = device.lock_status === 'locked' ? 'unlocked' : 'locked';
                    // Optimistically show transitional state while backend issues command
                    setDevice(prev =>
                      prev
                        ? {
                            ...prev,
                            lock_status:
                              targetStatus === 'locked' ? 'locking' : 'unlocking',
                          }
                        : prev,
                    );

                    const response = await apiService.updateLockStatus(
                      device.id,
                      targetStatus,
                    );

                    const nextStatus =
                      (response?.lock_status as DeviceDetails['lock_status']) ||
                      (targetStatus === 'locked' ? 'locking' : 'unlocking');

                    setDevice(prev =>
                      prev ? { ...prev, lock_status: nextStatus } : prev,
                    );

                    addToast({
                      type: 'success',
                      title:
                        targetStatus === 'locked'
                          ? 'Lock command sent'
                          : 'Unlock command sent',
                    });
                  } catch (e) {
                    // Reload device details to ensure we show the true backend state
                    await loadDeviceDetails();
                    addToast({ type: 'error', title: 'Failed to update lock status' });
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  device.lock_status === 'locked'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {device.lock_status === 'locked' || device.lock_status === 'locking'
                  ? 'Unlock'
                  : 'Lock'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => handleTabChange('overview')}
            className={`${
              activeTab === 'overview'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            Overview
          </button>
          <button
            onClick={() => handleTabChange('denylist')}
            className={`${
              activeTab === 'denylist'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            Denylist
            {denylistEntries.length > 0 && (
              <span className="ml-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-0.5 px-2 rounded-full text-xs">
                {denylistEntries.length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('diagnostics')}
            className={`${
              activeTab === 'diagnostics'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            Diagnostics
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 space-y-6">
            {/* Quick Links */}
            <div className="flex flex-wrap gap-3">
              {device.primary_tenant && (
                <button
                  onClick={() => navigate(`/users/${device.primary_tenant?.id}`)}
                  className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <UserIcon className="h-4 w-4 mr-2" />
                  {device.primary_tenant.first_name} {device.primary_tenant.last_name}
                </button>
              )}
              {device.unit_id && device.unit_number && (
                <button
                  onClick={() => navigate(`/units/${device.unit_id}`)}
                  className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                  Unit {device.unit_number}
                </button>
              )}
            </div>
            {/* Device Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Device Status</label>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[device.device_status] || statusColors.offline}`}>
                    <CheckCircleIcon className="h-4 w-4 mr-1" />
                    {device.device_status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Lock Status</label>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      lockStatusColors[device.lock_status] || lockStatusColors.unknown
                    }`}
                  >
                    {device.lock_status === 'locked' ||
                    device.lock_status === 'locking' ? (
                      <LockClosedIcon className="h-4 w-4 mr-1" />
                    ) : device.lock_status === 'unlocked' ||
                      device.lock_status === 'unlocking' ? (
                      <LockOpenIcon className="h-4 w-4 mr-1" />
                    ) : (
                      <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                    )}
                    {device.lock_status}
                  </span>
                </div>
              </div>

              {device.battery_level !== undefined && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Battery Level</label>
                  <div className="mt-1 flex items-center">
                    <BatteryIcon className={`h-5 w-5 mr-2 ${
                      device.battery_level < 20 ? 'text-red-500' : 
                      device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500'
                    }`} />
                    <span className="text-lg font-medium text-gray-900 dark:text-white">
                      {device.battery_level}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Device Information */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Device Information</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Serial Number</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{device.device_serial}</dd>
                </div>
                {device.firmware_version && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Firmware Version</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{device.firmware_version}</dd>
                  </div>
                )}
                {device.unit_number && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Unit</dt>
                    <dd className="mt-1">
                      <button
                        onClick={() => navigate(`/units/${device.unit_id}`)}
                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center"
                      >
                        Unit {device.unit_number}
                        <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                      </button>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Facility</dt>
                  <dd className="mt-1">
                    <button
                      onClick={() => navigate(`/facilities/${device.facility_id}`)}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center"
                    >
                      {device.facility_name}
                      <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                    </button>
                  </dd>
                </div>
                {device.last_activity && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Activity</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                      {new Date(device.last_activity).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Primary Tenant */}
            {device.primary_tenant && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Primary Tenant</h3>
                <div className="flex items-center">
                  <UserIcon className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {device.primary_tenant.first_name} {device.primary_tenant.last_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{device.primary_tenant.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'denylist' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Denylist Entries</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Users currently denied access to this device
                </p>
              </div>
            </div>

            {loadingDenylist ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : denylistEntries.length === 0 ? (
              <div className="text-center py-12">
                <ShieldExclamationIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No denylist entries</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  All users have access to this device
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Expires
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Time Remaining
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {denylistEntries.map((entry) => {
                      const isExpired = entry.expires_at ? new Date(entry.expires_at) < new Date() : false;
                      return (
                        <tr key={entry.id} className={isExpired ? 'opacity-60' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {entry.user.first_name && entry.user.last_name
                                    ? `${entry.user.first_name} ${entry.user.last_name}`
                                    : entry.user.email || entry.user_id}
                                </div>
                                {entry.user.email && (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {entry.user.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              {sourceLabels[entry.source] || entry.source}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {formatDate(entry.expires_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {entry.expires_at ? (
                              <span className={isExpired ? 'text-red-600 dark:text-red-400' : ''}>
                                {getTimeUntilExpiration(entry.expires_at)}
                              </span>
                            ) : (
                              <span className="text-gray-400">Permanent</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Diagnostics</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Diagnostic information will be available here in a future update.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

