import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import {
  LockClosedIcon,
  LockOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  Battery50Icon,
  Battery100Icon,
  UserIcon,
  ShieldExclamationIcon,
  ArrowTopRightOnSquareIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { EffectiveAccessCode, AccessMethod } from '@/types/facility.types';
import { useDetailsBackNavigation, withReturnPath } from '@/hooks/useBackNavigation';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useLockHardwareFeedback } from '@/hooks/useLockHardwareFeedback';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import type { LockDeviceSnapshot } from '@/utils/deviceStatusWs.utils';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { formatAccessDeviceListSubtitle, isGatewaySyncProvisioned } from '@/utils/accessDeviceDisplay.utils';
import {
  DetailsPageHeader,
  DetailsPageLoading,
  DetailsPageNotFound,
  DetailsPageShell,
  DetailsTabNav,
} from '@/components/Common/DetailsPageLayout';

interface DeviceDetails {
  id: string;
  name?: string;
  device_serial: string;
  /** Access-control only: enabled credential channels (app / keypad / fob). */
  access_methods?: AccessMethod[];
  /** Access-control only: relay actuation channel (1–8). */
  relay_channel?: number;
  /** Access-control only: gate / door / elevator. */
  device_type?: 'gate' | 'elevator' | 'door';
  gateway_id?: string;
  gateway_name?: string | null;
  location_description?: string;
  metadata?: Record<string, unknown>;
  /** When true, cloud may issue remote lock; default false — unlock-only from cloud. */
  supports_remote_lock?: boolean;
  /** Gateway-provided serial number (optional, separate from device_serial) */
  serial?: string;
  unit_id?: string;
  unit_number?: string;
  facility_id: string;
  facility_name: string;
  lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
  /** Wireless signal strength in dBm (e.g., -70 dBm) */
  signal_strength?: number;
  /** Device temperature reading in Celsius */
  temperature?: number;
  /** Standardized error code for error states */
  error_code?: string | null;
  /** Human-readable error description */
  error_message?: string | null;
  last_activity?: string;
  last_seen?: string;
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
type DeviceCategory = 'blulok' | 'access_control';

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
  const { goBack, showBack, backLabel } = useDetailsBackNavigation({ fallbackPath: '/devices' });
  const [device, setDevice] = useState<DeviceDetails | null>(null);
  const [denylistEntries, setDenylistEntries] = useState<DenylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDenylist, setLoadingDenylist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory | null>(null);
  const [effectiveAccessCode, setEffectiveAccessCode] = useState<EffectiveAccessCode | null>(null);
  const [deviceGroupNames, setDeviceGroupNames] = useState<string[]>([]);
  const [accessMethodsDraft, setAccessMethodsDraft] = useState<AccessMethod[]>(['app']);
  const [editingAccessMethods, setEditingAccessMethods] = useState(false);
  const [savingAccessMethods, setSavingAccessMethods] = useState(false);
  const [showUnassignFromUnitConfirm, setShowUnassignFromUnitConfirm] = useState(false);
  const [unassigningFromUnit, setUnassigningFromUnit] = useState(false);
  const [showRemoveInventoryConfirm, setShowRemoveInventoryConfirm] = useState(false);
  const [removingFromInventory, setRemovingFromInventory] = useState(false);

  const deviceLockStatusRef = useRef<DeviceDetails['lock_status'] | undefined>(undefined);
  const pendingRemoteUnlockRef = useRef(false);
  const { scheduleUnlockWatch, cancelWatch } = useLockHardwareFeedback();

  deviceLockStatusRef.current = device?.lock_status;

  useEffect(() => {
    if (!pendingRemoteUnlockRef.current) return;
    if (device?.lock_status === 'unlocked') {
      cancelWatch();
      pendingRemoteUnlockRef.current = false;
    }
  }, [device?.lock_status, cancelWatch]);

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
      if (activeTab === 'denylist' && deviceCategory === 'blulok') {
        loadDenylist();
      }
    }
  }, [deviceId, activeTab, deviceCategory]);

  useEffect(() => {
    if (deviceCategory === 'access_control' && activeTab === 'denylist') {
      setActiveTab('overview');
    }
  }, [deviceCategory, activeTab]);

  useEffect(() => {
    const loadDeviceGroups = async () => {
      if (!device?.facility_id || !device?.id) {
        setDeviceGroupNames([]);
        return;
      }

      try {
        const groupsResponse = await apiService.getDeviceGroups(device.facility_id);
        const groups = groupsResponse.data || [];
        const details = await Promise.all(groups.map((group) => apiService.getDeviceGroup(group.id)));
        const names = details
          .filter((detail) => (detail.data.members || []).some((member) => member.device_id === device.id))
          .map((detail) => detail.data.name);
        setDeviceGroupNames(names);
      } catch (loadError) {
        console.error('Failed to load device groups:', loadError);
        setDeviceGroupNames([]);
      }
    };

    loadDeviceGroups().catch(() => undefined);
  }, [device?.facility_id, device?.id]);

  useEffect(() => {
    const loadEffectiveCode = async () => {
      if (!device?.facility_id || !device?.id || deviceCategory !== 'access_control') {
        setEffectiveAccessCode(null);
        return;
      }
      try {
        const response = await apiService.getEffectiveAccessCodes(device.facility_id);
        const match = (response.data || []).find((entry: EffectiveAccessCode) => entry.device_id === device.id) || null;
        setEffectiveAccessCode(match);
      } catch (error) {
        console.error('Failed to load effective access code for device:', error);
        setEffectiveAccessCode(null);
      }
    };
    loadEffectiveCode().catch(() => undefined);
  }, [device?.facility_id, device?.id, deviceCategory]);

  const mergeDeviceFromSnapshots = useCallback((rows: LockDeviceSnapshot[]) => {
    if (!deviceId || rows.length === 0) return;
    const deviceUpdate = rows.find((r) => r.device_id === deviceId) ?? rows[0];
    setDevice((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lock_status: (deviceUpdate.lock_status ?? prev.lock_status) as DeviceDetails['lock_status'],
        device_status: (deviceUpdate.device_status ?? prev.device_status) as DeviceDetails['device_status'],
        battery_level: deviceUpdate.battery_level ?? prev.battery_level,
        signal_strength: deviceUpdate.signal_strength ?? prev.signal_strength,
        temperature:
          deviceUpdate.temperature !== undefined && deviceUpdate.temperature !== null
            ? (() => {
                const temp =
                  typeof deviceUpdate.temperature === 'number'
                    ? deviceUpdate.temperature
                    : Number(deviceUpdate.temperature);
                return Number.isNaN(temp) ? prev.temperature : temp;
              })()
            : prev.temperature,
        error_code: deviceUpdate.error_code ?? prev.error_code,
        error_message: deviceUpdate.error_message ?? prev.error_message,
        firmware_version: deviceUpdate.firmware_version ?? prev.firmware_version,
        last_activity: deviceUpdate.last_activity ?? prev.last_activity,
        last_seen: deviceUpdate.last_seen ?? prev.last_seen,
      };
    });
  }, [deviceId]);

  useLockDeviceRealtime({
    deviceId: deviceId ?? undefined,
    onDeviceRows: mergeDeviceFromSnapshots,
    subscribeUnitsForRefresh: false,
  });

  const loadDeviceDetails = async () => {
    if (!deviceId) return;

    try {
      setLoading(true);
      setError(null);
      
      // First try BluLok details, then fallback to access-control details.
      try {
        const response = await apiService.getBluLokDevice(deviceId);
        if (!response?.device) {
          setError('Device not found');
          return;
        }
        // Normalize temperature to ensure it's a number
        const normalizedDevice = {
          ...response.device,
          supports_remote_lock: Boolean((response.device as { supports_remote_lock?: boolean }).supports_remote_lock),
          temperature: response.device.temperature !== undefined && response.device.temperature !== null
            ? (() => {
                const temp = typeof response.device.temperature === 'number'
                  ? response.device.temperature
                  : Number(response.device.temperature);
                return isNaN(temp) ? undefined : temp;
              })()
            : undefined,
        };
        setDeviceCategory('blulok');
        setDevice(normalizedDevice);
      } catch (blulokError: any) {
        if (blulokError?.response?.status !== 404) {
          throw blulokError;
        }

        const response = await apiService.getAccessControlDevice(deviceId);
        if (!response?.device) {
          setError('Device not found');
          return;
        }

        const ac = response.device;
        const methods = (ac.access_methods && ac.access_methods.length > 0 ? ac.access_methods : ['app']) as AccessMethod[];
        const mappedAccessControl: DeviceDetails = {
          id: ac.id,
          name: ac.name,
          device_serial: ac.device_serial || ac.name || ac.id,
          access_methods: methods,
          relay_channel: ac.relay_channel,
          device_type: ac.device_type,
          gateway_id: ac.gateway_id,
          gateway_name: ac.gateway_name,
          location_description: ac.location_description,
          metadata: ac.metadata,
          supports_remote_lock: Boolean(ac.supports_remote_lock),
          facility_id: ac.facility_id,
          facility_name: ac.facility_name || String(ac.facility_id),
          lock_status: ac.is_locked ? 'locked' : 'unlocked',
          device_status: ac.status || 'offline',
          last_activity: ac.last_activity,
          firmware_version: ac.firmware_version,
          unit_id: undefined,
          unit_number: undefined,
          battery_level: undefined,
          signal_strength: undefined,
          temperature: undefined,
          error_code: null,
          error_message: null,
          primary_tenant: undefined,
          last_seen: undefined,
        };
        setDeviceCategory('access_control');
        setDenylistEntries([]);
        setAccessMethodsDraft(methods);
        setEditingAccessMethods(false);
        setDevice(mappedAccessControl);
      }
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
    if (!deviceId || deviceCategory !== 'blulok') return;

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

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const isDevAdmin = authState.user?.role === UserRole.DEV_ADMIN;
  const isGlobalAdmin =
    authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN;

  const saveAccessMethods = async () => {
    if (!device || deviceCategory !== 'access_control') return;
    const effective =
      accessMethodsDraft.length > 0 ? accessMethodsDraft : (['app'] as AccessMethod[]);
    try {
      setSavingAccessMethods(true);
      await apiService.updateAccessControlDevice(device.id, { access_methods: effective });
      setDevice((prev) => (prev ? { ...prev, access_methods: effective } : prev));
      setEditingAccessMethods(false);
      addToast({ type: 'success', title: 'Access methods updated' });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Failed to update access methods' });
    } finally {
      setSavingAccessMethods(false);
    }
  };

  const toggleAccessMethod = (method: AccessMethod) => {
    setAccessMethodsDraft((prev) => {
      const next = prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method];
      return (next.length > 0 ? next : (['app'] as AccessMethod[])) as AccessMethod[];
    });
  };

  if (loading) {
    return <DetailsPageLoading />;
  }

  if (error || !device) {
    return (
      <DetailsPageNotFound
        title="Device not found"
        message={error || 'Device not found'}
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
      />
    );
  }

  const BatteryIcon = device.battery_level !== undefined && device.battery_level < 20
    ? Battery50Icon
    : Battery100Icon;

  const deviceSubtitle =
    deviceCategory === 'access_control'
      ? formatAccessDeviceListSubtitle({
          device_serial: device.device_serial,
          relay_channel: device.relay_channel,
          location_description: device.location_description,
        })
      : device.device_serial;

  const deviceTabs = [
    { key: 'overview', label: 'Overview' },
    ...(deviceCategory === 'blulok'
      ? [
          {
            key: 'denylist',
            label: 'Denylist',
            badge:
              denylistEntries.length > 0 ? (
                <span className="ml-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-0.5 px-2 rounded-full text-xs">
                  {denylistEntries.length}
                </span>
              ) : undefined,
          },
        ]
      : []),
    { key: 'diagnostics', label: 'Diagnostics' },
  ];

  return (
    <DetailsPageShell>
      <DetailsPageHeader
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
        title={device.name || device.device_serial}
        subtitle={
          <>
            {deviceSubtitle}
            {device.unit_number ? ` • Unit ${device.unit_number}` : null}
          </>
        }
        meta={
          deviceCategory === 'access_control' && isGatewaySyncProvisioned(device.metadata) ? (
            <span className="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
              Gateway sync managed
            </span>
          ) : undefined
        }
        actions={
          canManage && (deviceCategory === 'blulok' || deviceCategory === 'access_control') ? (
            <button
              disabled={
                !canRequestRemoteUnlock(device.lock_status) ||
                isLockTransitionPending(device.lock_status) ||
                (deviceCategory === 'access_control' && device.device_status !== 'online')
              }
              onClick={async () => {
                if (!canRequestRemoteUnlock(device.lock_status)) return;
                if (deviceCategory === 'access_control' && device.device_status !== 'online') return;
                try {
                  pendingRemoteUnlockRef.current = true;
                  scheduleUnlockWatch(() => deviceLockStatusRef.current, () => {
                    pendingRemoteUnlockRef.current = false;
                  });

                  setDevice(prev =>
                    prev
                      ? {
                          ...prev,
                          lock_status: 'unlocking',
                        }
                      : prev,
                  );

                  const response =
                    deviceCategory === 'blulok'
                      ? await apiService.updateLockStatus(device.id, 'unlocked')
                      : await apiService.updateAccessControlLockStatus(device.id, 'unlocked');

                  const nextStatus =
                    (response?.lock_status as DeviceDetails['lock_status']) || 'unlocking';

                  setDevice(prev =>
                    prev ? { ...prev, lock_status: nextStatus } : prev,
                  );

                  addToast(lockHardwareFeedbackToasts.unlockCommandSent());
                } catch (e) {
                  pendingRemoteUnlockRef.current = false;
                  cancelWatch();
                  await loadDeviceDetails();
                  addToast(lockHardwareFeedbackToasts.failedToUpdateLockStatus());
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isLockTransitionPending(device.lock_status)
                  ? 'bg-blue-600 text-white animate-pulse'
                  : canRequestRemoteUnlock(device.lock_status)
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
              }`}
            >
              {isLockTransitionPending(device.lock_status)
                ? 'Unlocking…'
                : canRequestRemoteUnlock(device.lock_status)
                  ? 'Unlock'
                  : 'Unlocked'}
            </button>
          ) : undefined
        }
      />

      <DetailsTabNav tabs={deviceTabs} activeKey={activeTab} onChange={(key) => handleTabChange(key as TabType)} />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 space-y-6">
            {/* Quick Links */}
            <div className="flex flex-wrap gap-3">
              {device.primary_tenant && (
                <button
                  onClick={() =>
                    navigate(`/users/${device.primary_tenant?.id}/details`, {
                      state: withReturnPath(location),
                    })
                  }
                  className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <UserIcon className="h-4 w-4 mr-2" />
                  {device.primary_tenant.first_name} {device.primary_tenant.last_name}
                </button>
              )}
              {device.unit_id && device.unit_number && (
                <button
                  onClick={() =>
                    navigate(`/units/${device.unit_id}`, { state: withReturnPath(location) })
                  }
                  className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                  Unit {device.unit_number}
                </button>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Device Groups</p>
              {deviceGroupNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {deviceGroupNames.map((groupName) => (
                    <span
                      key={groupName}
                      className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300"
                    >
                      {groupName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This device is not currently assigned to a group.
                </p>
              )}
            </div>
            {deviceCategory === 'blulok' && canManage && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Unit assignment</p>
                {device.unit_id && device.unit_number ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      This lock is assigned to unit <span className="font-medium">{device.unit_number}</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowUnassignFromUnitConfirm(true)}
                      className="rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Unassign from unit
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    This lock is not assigned to a unit. Assign it from the unit&apos;s page when ready.
                  </p>
                )}
              </div>
            )}
            {deviceCategory === 'blulok' && isGlobalAdmin && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
                <p className="text-sm font-medium text-red-900 dark:text-red-200">Remove from facility (cloud inventory)</p>
                <p className="text-sm text-red-800/90 dark:text-red-100/90">
                  Deletes this lock&apos;s cloud record for the current gateway: unit link (if any), device group
                  memberships, and denylist entries. Route passes already issued expire on schedule. If the hardware
                  still reports on the gateway, it can reappear after the next device sync.
                  {device.unit_id ? (
                    <>
                      {' '}
                      This lock is still assigned to a unit — consider{' '}
                      <span className="font-medium">Unassign from unit</span> first if it should remain in this facility.
                    </>
                  ) : null}{' '}
                  To bind the{' '}
                  <span className="font-medium">gateway</span> to another facility, use the facility{' '}
                  <button
                    type="button"
                    className="font-medium text-red-900 dark:text-red-100 underline"
                    onClick={() =>
                      navigate(`/facilities/${device.facility_id}?tab=gateway`, {
                        state: withReturnPath(location),
                      })
                    }
                  >
                    Gateway
                  </button>{' '}
                  tab (admin reassignment).
                </p>
                <button
                  type="button"
                  onClick={() => setShowRemoveInventoryConfirm(true)}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Remove lock from cloud inventory…
                </button>
              </div>
            )}
            {deviceCategory === 'access_control' && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Current Effective Access Code</p>
                {effectiveAccessCode ? (
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                    <div className="font-mono tracking-widest text-base text-gray-900 dark:text-white">{effectiveAccessCode.code}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Source: {effectiveAccessCode.source_scope_name} • Valid until {new Date(effectiveAccessCode.valid_until).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No effective code assigned to this device.</p>
                )}
              </div>
            )}
            {deviceCategory === 'access_control' && canManage && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Access methods</p>
                  {!editingAccessMethods ? (
                    <button
                      type="button"
                      onClick={() => setEditingAccessMethods(true)}
                      className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingAccessMethods}
                        onClick={() => void saveAccessMethods()}
                        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {savingAccessMethods ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const m =
                            device.access_methods && device.access_methods.length > 0
                              ? device.access_methods
                              : (['app'] as AccessMethod[]);
                          setAccessMethodsDraft(m);
                          setEditingAccessMethods(false);
                        }}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {!editingAccessMethods ? (
                  <div className="flex flex-wrap gap-2">
                    {(accessMethodsDraft.length > 0 ? accessMethodsDraft : ['app']).map((method) => (
                      <span
                        key={method}
                        className="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 capitalize"
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {(['app', 'keypad', 'fob'] as const).map((method) => (
                      <label
                        key={method}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <input
                          type="checkbox"
                          checked={(accessMethodsDraft.length > 0 ? accessMethodsDraft : ['app']).includes(method)}
                          onChange={() => toggleAccessMethod(method)}
                        />
                        <span className="capitalize">{method}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(deviceCategory === 'access_control' || deviceCategory === 'blulok') &&
              device.supports_remote_lock !== true && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Remote control from the cloud is unlock-only for this hardware. Re-lock on site.
              </p>
            )}
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

              {device.signal_strength !== undefined && device.signal_strength !== null && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Signal Strength</label>
                  <div className="mt-1 flex items-center">
                    <SignalIcon className={`h-5 w-5 mr-2 ${
                      device.signal_strength >= -50 ? 'text-green-500' :
                      device.signal_strength >= -70 ? 'text-yellow-500' : 'text-red-500'
                    }`} />
                    <span className="text-lg font-medium text-gray-900 dark:text-white">
                      {device.signal_strength} dBm
                    </span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      ({device.signal_strength >= -50 ? 'Excellent' :
                        device.signal_strength >= -60 ? 'Good' :
                        device.signal_strength >= -70 ? 'Fair' : 'Weak'})
                    </span>
                  </div>
                </div>
              )}

              {device.temperature !== undefined && device.temperature !== null && (() => {
                const tempNum = typeof device.temperature === 'number' ? device.temperature : Number(device.temperature);
                if (isNaN(tempNum)) return null;
                return (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Temperature</label>
                    <div className="mt-1 flex items-center">
                      <span className={`text-lg font-medium ${
                        tempNum > 50 ? 'text-red-500' :
                        tempNum < 5 ? 'text-blue-500' : 'text-gray-900 dark:text-white'
                      }`}>
                        {tempNum.toFixed(1)}°C
                      </span>
                      {tempNum > 50 && (
                        <span className="ml-2 text-sm text-red-500">⚠ High</span>
                      )}
                      {tempNum < 5 && (
                        <span className="ml-2 text-sm text-blue-500">❄ Low</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Error Information */}
            {device.error_code && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">
                      Error: {device.error_code}
                    </h4>
                    {device.error_message && (
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        {device.error_message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Device Information */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Device Information</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {deviceCategory === 'access_control' ? 'Hardware Serial' : 'Serial Number'}
                  </dt>
                  <dd className="mt-1 text-sm font-mono text-gray-900 dark:text-white">{device.device_serial}</dd>
                </div>
                {deviceCategory === 'access_control' && device.relay_channel != null && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Relay Channel</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">#{device.relay_channel}</dd>
                  </div>
                )}
                {deviceCategory === 'access_control' && device.device_type && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Device Type</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white capitalize">{device.device_type}</dd>
                  </div>
                )}
                {deviceCategory === 'access_control' && device.location_description && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Location</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{device.location_description}</dd>
                  </div>
                )}
                {deviceCategory === 'access_control' && device.gateway_name && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Gateway</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{device.gateway_name}</dd>
                  </div>
                )}
                {deviceCategory === 'access_control' && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Provisioning</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                      {isGatewaySyncProvisioned(device.metadata) ? 'Gateway inventory sync' : 'Manual (admin)'}
                    </dd>
                  </div>
                )}
                {device.serial && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Gateway Serial</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{device.serial}</dd>
                  </div>
                )}
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
                        onClick={() =>
                    navigate(`/units/${device.unit_id}`, { state: withReturnPath(location) })
                  }
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
                      onClick={() =>
                        navigate(`/facilities/${device.facility_id}`, {
                          state: withReturnPath(location),
                        })
                      }
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

            {isDevAdmin && device && (
              <div className="mb-8 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/25 p-5">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  Gateway denylist commands (Dev Admin)
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                  Same flow as Facility Gateway → Dev Tools: sends signed DENYLIST_ADD / DENYLIST_REMOVE to this
                  facility&apos;s connected gateway. Device IDs default to this lock; you can add more
                  comma-separated IDs. Requires an active gateway WebSocket session for delivery.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const userId = window.prompt('Enter user ID to add to denylist:');
                      if (!userId) return;
                      const rawIds = window.prompt(
                        'Enter device IDs (comma-separated):',
                        device.id,
                      );
                      if (!rawIds) return;
                      const targetDeviceIds = rawIds
                        .split(',')
                        .map((id) => id.trim())
                        .filter(Boolean);
                      if (targetDeviceIds.length === 0) return;
                      try {
                        const res = await apiService.sendGatewayCommand({
                          facilityId: device.facility_id,
                          command: 'DENYLIST_ADD',
                          targetDeviceIds,
                          userId,
                        });
                        addToast({ type: 'success', title: `DENYLIST_ADD sent: ${res.success}` });
                        await loadDenylist();
                      } catch (err: unknown) {
                        const message =
                          err && typeof err === 'object' && 'response' in err
                            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                            : undefined;
                        addToast({
                          type: 'error',
                          title: message || 'Failed to send DENYLIST_ADD',
                        });
                      }
                    }}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    DENYLIST_ADD
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const userId = window.prompt('Enter user ID to remove from denylist:');
                      if (!userId) return;
                      const rawIds = window.prompt(
                        'Enter device IDs (comma-separated):',
                        device.id,
                      );
                      if (!rawIds) return;
                      const targetDeviceIds = rawIds
                        .split(',')
                        .map((id) => id.trim())
                        .filter(Boolean);
                      if (targetDeviceIds.length === 0) return;
                      try {
                        const res = await apiService.sendGatewayCommand({
                          facilityId: device.facility_id,
                          command: 'DENYLIST_REMOVE',
                          targetDeviceIds,
                          userId,
                        });
                        addToast({ type: 'success', title: `DENYLIST_REMOVE sent: ${res.success}` });
                        await loadDenylist();
                      } catch (err: unknown) {
                        const message =
                          err && typeof err === 'object' && 'response' in err
                            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                            : undefined;
                        addToast({
                          type: 'error',
                          title: message || 'Failed to send DENYLIST_REMOVE',
                        });
                      }
                    }}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    DENYLIST_REMOVE
                  </button>
                </div>
              </div>
            )}

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

      <ConfirmModal
        isOpen={showUnassignFromUnitConfirm}
        onClose={() => setShowUnassignFromUnitConfirm(false)}
        onConfirm={() => {
          void (async () => {
            if (!device?.id) return;
            setUnassigningFromUnit(true);
            try {
              await apiService.unassignDeviceFromUnit(device.id);
              addToast({ type: 'success', title: 'Device unassigned from unit successfully' });
              setShowUnassignFromUnitConfirm(false);
              await loadDeviceDetails();
            } catch (err: unknown) {
              const apiErr = err as { response?: { data?: { message?: string } } };
              addToast({
                type: 'error',
                title: apiErr?.response?.data?.message || 'Failed to unassign lock from unit',
              });
            } finally {
              setUnassigningFromUnit(false);
            }
          })();
        }}
        title="Unassign lock from unit?"
        message={`Remove this lock from unit ${device.unit_number ?? ''}? It will show as unassigned in this facility and can be linked to another unit. The gateway record is unchanged.`}
        confirmText="Unassign"
        variant="warning"
        isLoading={unassigningFromUnit}
      />

      <ConfirmModal
        isOpen={showRemoveInventoryConfirm}
        onClose={() => setShowRemoveInventoryConfirm(false)}
        onConfirm={() => {
          void (async () => {
            if (!device?.id) return;
            const facilityId = device.facility_id;
            setRemovingFromInventory(true);
            try {
              await apiService.removeBluLokDeviceFromCloudInventory(device.id);
              addToast({ type: 'success', title: 'Lock removed from cloud inventory' });
              setShowRemoveInventoryConfirm(false);
              navigate(`/facilities/${facilityId}?tab=devices`);
            } catch (err: unknown) {
              const apiErr = err as { response?: { data?: { message?: string }; status?: number } };
              const message = apiErr?.response?.data?.message || 'Failed to remove lock from inventory';
              addToast({ type: 'error', title: message });
              if (apiErr?.response?.status === 404) {
                setShowRemoveInventoryConfirm(false);
                if (facilityId) {
                  navigate(`/facilities/${facilityId}?tab=devices`);
                }
              }
            } finally {
              setRemovingFromInventory(false);
            }
          })();
        }}
        title="Remove lock from cloud inventory?"
        message={
          device.unit_id
            ? `This permanently deletes the lock row (including its assignment to unit ${device.unit_number ?? ''}), group memberships, and denylist entries. Route passes already issued expire on schedule. Continue only if you are recommissioning or correcting a wrong facility attachment.`
            : 'This permanently deletes the lock row, group memberships, and denylist entries in the database. Route passes already issued expire on schedule. Continue only if you are recommissioning or correcting a wrong facility attachment.'
        }
        confirmText="Remove from inventory"
        variant="danger"
        isLoading={removingFromInventory}
      />
    </DetailsPageShell>
  );
}

