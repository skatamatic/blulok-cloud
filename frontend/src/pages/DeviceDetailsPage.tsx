import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { PencilIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { EffectiveAccessCode, AccessMethod } from '@/types/facility.types';
import { useDetailsBackNavigation, replaceSearchParams } from '@/hooks/useBackNavigation';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { resolveLockTimeoutMsForFacility } from '@/utils/facilityLockTimeout.utils';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import type { LockDeviceSnapshot } from '@/utils/deviceStatusWs.utils';
import {
  normalizeAccessControlReportedStatus,
  normalizeBluLokDeviceStatus,
} from '@/utils/device-reachability.utils';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { usePromptDialog } from '@/hooks/usePromptDialog';
import { EditDeviceMetadataModal } from '@/components/Devices/EditDeviceMetadataModal';
import { formatAccessDevicePageTitle, isGatewaySyncProvisioned } from '@/utils/accessDeviceDisplay.utils';
import { formatBluLokDevicePageTitle } from '@/utils/blulokDeviceDisplay.utils';
import { formatMetadataSideEffectsToast } from '@/utils/deviceApiErrors';
import type { DeviceMetadataSideEffects } from '@/types/facility.types';
import {
  DetailsPageHeader,
  DetailsPageLoading,
  DetailsPageNotFound,
  DetailsPageShell,
  DetailsTabNav,
} from '@/components/Common/DetailsPageLayout';
import { detailsBtnSecondarySm, detailsTabCountBadgeClass, detailsUnlockButtonClass } from '@/components/Common/details-page.styles';
import { DeviceDetailsOverview } from '@/components/Devices/DeviceDetailsOverview';
import { loadAccessGroupRefsForDevice } from '@/utils/access-groups-load.utils';
import type { UnitAccessGroupRef } from '@/utils/device-group-membership.utils';

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
  /** BluLok admin settings (lockNumber, displayName, locationDescription, …) */
  device_settings?: Record<string, unknown>;
  unit_id?: string;
  unit_number?: string;
  facility_id: string;
  facility_name: string;
  lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  reported_device_status?: 'online' | 'offline' | 'low_battery' | 'error';
  reported_status?: 'online' | 'offline' | 'error' | 'maintenance';
  status_unreachable_reason?: string | null;
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

function mapAccessControlStatusToDeviceStatus(
  status: string | undefined,
): DeviceDetails['device_status'] {
  if (status === 'maintenance' || status === 'offline') return 'offline';
  if (status === 'error') return 'error';
  return 'online';
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

type DeviceCategory = 'blulok' | 'access_control';
type DeviceTab = 'overview' | 'denylist';

function getDeviceTabFromSearch(search: string): DeviceTab {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'denylist' ? 'denylist' : 'overview';
}

export default function DeviceDetailsPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const { openPrompt, promptDialog } = usePromptDialog();
  const { authState } = useAuth();
  const { goBack, showBack, backLabel } = useDetailsBackNavigation({ fallbackPath: '/devices' });
  const [device, setDevice] = useState<DeviceDetails | null>(null);
  const [denylistEntries, setDenylistEntries] = useState<DenylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDenylist, setLoadingDenylist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory | null>(null);
  const [activeTab, setActiveTab] = useState<DeviceTab>(() => getDeviceTabFromSearch(location.search));
  const [effectiveAccessCode, setEffectiveAccessCode] = useState<EffectiveAccessCode | null>(null);
  const [deviceAccessGroups, setDeviceAccessGroups] = useState<UnitAccessGroupRef[]>([]);
  const [showEditMetadataModal, setShowEditMetadataModal] = useState(false);
  const [showUnassignFromUnitConfirm, setShowUnassignFromUnitConfirm] = useState(false);
  const [unassigningFromUnit, setUnassigningFromUnit] = useState(false);
  const [showRemoveInventoryConfirm, setShowRemoveInventoryConfirm] = useState(false);
  const [removingFromInventory, setRemovingFromInventory] = useState(false);
  const [linkedUnitStatus, setLinkedUnitStatus] = useState<string | null>(null);
  const [linkedUnitOverlocked, setLinkedUnitOverlocked] = useState(false);
  const [overlockSaving, setOverlockSaving] = useState(false);

  const deviceLockStatusRef = useRef<DeviceDetails['lock_status'] | undefined>(undefined);
  const { facilities: globalFacilities, selectedFacility } = useGlobalFacility();
  const { requestUnlock, isSubmitting, syncLockStatus } = useRemoteUnlockAction({
    errorToast: lockHardwareFeedbackToasts.failedToUpdateLockStatus,
  });

  deviceLockStatusRef.current = device?.lock_status;

  useEffect(() => {
    if (deviceId && device?.lock_status) {
      syncLockStatus(deviceId, device.lock_status);
    }
  }, [deviceId, device?.lock_status, syncLockStatus]);

  useEffect(() => {
    setActiveTab(getDeviceTabFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    if (deviceCategory === 'access_control' && activeTab === 'denylist') {
      setActiveTab('overview');
    }
  }, [deviceCategory, activeTab]);

  useEffect(() => {
    if (deviceId && deviceCategory === 'blulok' && (activeTab === 'denylist' || denylistEntries.length === 0)) {
      loadDenylist();
    }
  }, [deviceId, deviceCategory, activeTab]);

  useEffect(() => {
    if (deviceId) {
      loadDeviceDetails();
    }
  }, [deviceId]);

  useEffect(() => {
    const loadDeviceGroups = async () => {
      if (!device?.facility_id || !device?.id) {
        setDeviceAccessGroups([]);
        return;
      }

      try {
        const refs = await loadAccessGroupRefsForDevice(
          device.facility_id,
          device.id,
          deviceCategory === 'blulok' ? 'blulok' : 'access_control',
          device.unit_id,
        );
        setDeviceAccessGroups(refs);
      } catch (loadError) {
        console.error('Failed to load device groups:', loadError);
        setDeviceAccessGroups([]);
      }
    };

    loadDeviceGroups().catch(() => undefined);
  }, [device?.facility_id, device?.id, device?.unit_id, deviceCategory]);

  useEffect(() => {
    const loadLinkedUnit = async () => {
      if (!device?.unit_id) {
        setLinkedUnitStatus(null);
        setLinkedUnitOverlocked(false);
        return;
      }
      try {
        const response = await apiService.getUnit(device.unit_id);
        const unit = response?.unit ?? response;
        setLinkedUnitStatus(unit?.status ?? null);
        setLinkedUnitOverlocked(Boolean(unit?.is_overlocked));
      } catch {
        setLinkedUnitStatus(null);
        setLinkedUnitOverlocked(false);
      }
    };
    void loadLinkedUnit();
  }, [device?.unit_id]);

  const handleToggleOverlock = async (next: boolean) => {
    if (!device?.unit_id) return;
    setOverlockSaving(true);
    try {
      const response = await apiService.setUnitOverlock(device.unit_id, next);
      const unit = response?.unit ?? response;
      setLinkedUnitStatus(unit?.status ?? (next ? 'overlocked' : 'occupied'));
      setLinkedUnitOverlocked(Boolean(unit?.is_overlocked ?? next));
      addToast({
        type: 'success',
        title: next ? 'Unit marked as overlocked' : 'Overlock cleared',
      });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      addToast({
        type: 'error',
        title: apiErr?.response?.data?.message || 'Failed to update overlock status',
      });
    } finally {
      setOverlockSaving(false);
    }
  };

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
      const nextDeviceSettings =
        deviceUpdate.device_settings !== undefined
          ? deviceUpdate.device_settings
          : deviceUpdate.name !== undefined
            ? {
                ...(prev.device_settings ?? {}),
                displayName: deviceUpdate.name,
              }
            : prev.device_settings;
      const nextReportedDeviceStatus = normalizeBluLokDeviceStatus(
        deviceUpdate.reported_device_status ?? prev.reported_device_status ?? prev.device_status,
      );
      return {
        ...prev,
        ...(deviceUpdate.name !== undefined ? { name: deviceUpdate.name } : {}),
        ...(deviceUpdate.location_description !== undefined
          ? { location_description: deviceUpdate.location_description }
          : {}),
        ...(nextDeviceSettings !== prev.device_settings
          ? { device_settings: nextDeviceSettings }
          : {}),
        lock_status: (deviceUpdate.lock_status ?? prev.lock_status) as DeviceDetails['lock_status'],
        device_status: normalizeBluLokDeviceStatus(deviceUpdate.device_status ?? prev.device_status),
        reported_device_status: nextReportedDeviceStatus,
        ...(deviceCategory === 'access_control' && deviceUpdate.reported_device_status != null
          ? {
              reported_status: normalizeAccessControlReportedStatus(deviceUpdate.reported_device_status),
            }
          : {}),
        status_unreachable_reason:
          deviceUpdate.status_unreachable_reason !== undefined
            ? deviceUpdate.status_unreachable_reason
            : prev.status_unreachable_reason,
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
  }, [deviceId, deviceCategory]);

  useLockDeviceRealtime({
    deviceId: deviceId ?? undefined,
    facilityId: device?.facility_id,
    onDeviceRows: mergeDeviceFromSnapshots,
    debouncedRefresh: () => {
      void loadDeviceDetails();
    },
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
          facility_id: ac.facility_id ?? '',
          facility_name: ac.facility_name || String(ac.facility_id ?? ''),
          lock_status: ac.is_locked ? 'locked' : 'unlocked',
          device_status: mapAccessControlStatusToDeviceStatus(ac.status),
          reported_status: normalizeAccessControlReportedStatus(ac.reported_status ?? ac.status),
          status_unreachable_reason: ac.status_unreachable_reason ?? null,
          last_activity: ac.last_activity,
          firmware_version:
            typeof ac.metadata?.firmware_version === 'string'
              ? ac.metadata.firmware_version
              : undefined,
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

  const handleRemoteUnlock = useCallback(async () => {
    if (!device || !deviceId || !canRequestRemoteUnlock(device.lock_status)) return;
    if (deviceCategory === 'access_control' && device.device_status !== 'online') return;

    const previousStatus = device.lock_status ?? 'locked';
    let clearTransitionalAfterRefresh = false;
    const facilityForTimeout =
      globalFacilities.find((f) => f.id === device.facility_id) ?? selectedFacility;

    const patchLockStatus = (lockStatus: DeviceDetails['lock_status']) => {
      setDevice((prev) => (prev ? { ...prev, lock_status: lockStatus } : prev));
    };

    const refreshAfterUnlockAttempt = async () => {
      await loadDeviceDetails();
      if (!clearTransitionalAfterRefresh) return;
      clearTransitionalAfterRefresh = false;
      setDevice((prev) => {
        if (!prev) return prev;
        if (prev.lock_status === 'unlocking' || prev.lock_status === 'locking') {
          return { ...prev, lock_status: previousStatus as DeviceDetails['lock_status'] };
        }
        return prev;
      });
    };

    await requestUnlock({
      deviceId: device.id,
      watchKey: deviceId,
      timeoutMs: resolveLockTimeoutMsForFacility(facilityForTimeout),
      getLockStatus: () => deviceLockStatusRef.current,
      applyOptimisticUnlocking: () => patchLockStatus('unlocking'),
      revertOptimisticLockStatus: (status) => {
        clearTransitionalAfterRefresh = true;
        patchLockStatus(status as DeviceDetails['lock_status']);
      },
      sendUnlockCommand: async (id) => {
        if (deviceCategory === 'blulok') {
          return apiService.updateLockStatus(id, 'unlocked');
        }
        return apiService.updateAccessControlLockStatus(id, 'unlocked');
      },
      refresh: refreshAfterUnlockAttempt,
    });
  }, [device, deviceId, deviceCategory, globalFacilities, selectedFacility, requestUnlock]);

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

  const handleSendDenylistAdd = async () => {
    if (!device) return;
    const values = await openPrompt({
      title: 'DENYLIST_ADD',
      fields: [
        { key: 'userId', label: 'User ID', required: true },
        {
          key: 'deviceIds',
          label: 'Device IDs (comma-separated)',
          defaultValue: device.id,
          required: true,
        },
      ],
    });
    if (!values?.userId?.trim() || !values?.deviceIds?.trim()) return;
    const targetDeviceIds = values.deviceIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (targetDeviceIds.length === 0) return;
    try {
      const res = await apiService.sendGatewayCommand({
        facilityId: device.facility_id,
        command: 'DENYLIST_ADD',
        targetDeviceIds,
        userId: values.userId.trim(),
      });
      addToast({ type: 'success', title: `DENYLIST_ADD sent: ${res.success}` });
      await loadDenylist();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      addToast({ type: 'error', title: message || 'Failed to send DENYLIST_ADD' });
    }
  };

  const handleSendDenylistRemove = async () => {
    if (!device) return;
    const values = await openPrompt({
      title: 'DENYLIST_REMOVE',
      fields: [
        { key: 'userId', label: 'User ID', required: true },
        {
          key: 'deviceIds',
          label: 'Device IDs (comma-separated)',
          defaultValue: device.id,
          required: true,
        },
      ],
    });
    if (!values?.userId?.trim() || !values?.deviceIds?.trim()) return;
    const targetDeviceIds = values.deviceIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (targetDeviceIds.length === 0) return;
    try {
      const res = await apiService.sendGatewayCommand({
        facilityId: device.facility_id,
        command: 'DENYLIST_REMOVE',
        targetDeviceIds,
        userId: values.userId.trim(),
      });
      addToast({ type: 'success', title: `DENYLIST_REMOVE sent: ${res.success}` });
      await loadDenylist();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      addToast({ type: 'error', title: message || 'Failed to send DENYLIST_REMOVE' });
    }
  };

  const handleTabChange = (tab: DeviceTab) => {
    setActiveTab(tab);
    replaceSearchParams(navigate, location, (params) => {
      params.set('tab', tab);
    });
  };

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const isDevAdmin = authState.user?.role === UserRole.DEV_ADMIN;

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

  const deviceTabs = [
    { key: 'overview', label: 'Overview' },
    ...(deviceCategory === 'blulok'
      ? [
          {
            key: 'denylist',
            label: 'Denylist',
            badge:
              denylistEntries.length > 0 ? (
                <span className={detailsTabCountBadgeClass}>
                  {denylistEntries.length}
                </span>
              ) : undefined,
          },
        ]
      : []),
  ];

  return (
    <DetailsPageShell>
      <DetailsPageHeader
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
        title={
          deviceCategory === 'blulok'
            ? formatBluLokDevicePageTitle(device)
            : formatAccessDevicePageTitle(device)
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEditMetadataModal(true)}
                className={`${detailsBtnSecondarySm} gap-1.5`}
              >
                <PencilIcon className="h-4 w-4" />
                Edit device
              </button>
              <button
              disabled={
                !canRequestRemoteUnlock(device.lock_status) ||
                isLockTransitionPending(device.lock_status) ||
                isSubmitting(deviceId) ||
                (deviceCategory === 'access_control' && device.device_status !== 'online')
              }
              onClick={() => void handleRemoteUnlock()}
              className={detailsUnlockButtonClass({
                pending:
                  isLockTransitionPending(device.lock_status) || isSubmitting(deviceId),
                canUnlock: canRequestRemoteUnlock(device.lock_status),
              })}
            >
              {isLockTransitionPending(device.lock_status) || isSubmitting(deviceId)
                ? 'Unlocking…'
                : canRequestRemoteUnlock(device.lock_status)
                  ? 'Unlock'
                  : 'Unlocked'}
              </button>
            </div>
          ) : undefined
        }
      />

      <DetailsTabNav
        tabs={deviceTabs}
        activeKey={activeTab}
        onChange={(key) => handleTabChange(key as DeviceTab)}
      />

      <DeviceDetailsOverview
        activeTab={activeTab}
        device={device}
        deviceCategory={deviceCategory ?? 'blulok'}
        location={location}
        deviceAccessGroups={deviceAccessGroups}
        effectiveAccessCode={effectiveAccessCode}
        denylistEntries={denylistEntries}
        loadingDenylist={loadingDenylist}
        canManage={canManage}
        isDevAdmin={isDevAdmin}
        unitStatus={linkedUnitStatus}
        isOverlocked={linkedUnitOverlocked}
        overlockSaving={overlockSaving}
        onToggleOverlock={device?.unit_id ? handleToggleOverlock : undefined}
        onUnassignFromUnit={() => setShowUnassignFromUnitConfirm(true)}
        onRemoveFromInventory={() => setShowRemoveInventoryConfirm(true)}
        onSendDenylistAdd={handleSendDenylistAdd}
        onSendDenylistRemove={handleSendDenylistRemove}
      />

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
              if (deviceCategory === 'access_control') {
                await apiService.removeAccessControlDeviceFromCloudInventory(device.id);
                addToast({ type: 'success', title: 'Access device removed from cloud inventory' });
              } else {
                await apiService.removeBluLokDeviceFromCloudInventory(device.id);
                addToast({ type: 'success', title: 'Lock removed from cloud inventory' });
              }
              setShowRemoveInventoryConfirm(false);
              navigate(`/facilities/${facilityId}?tab=devices`);
            } catch (err: unknown) {
              const apiErr = err as { response?: { data?: { message?: string }; status?: number } };
              const message =
                apiErr?.response?.data?.message
                || (deviceCategory === 'access_control'
                  ? 'Failed to remove access device from inventory'
                  : 'Failed to remove lock from inventory');
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
        title={
          deviceCategory === 'access_control'
            ? 'Remove access device from cloud inventory?'
            : 'Remove lock from cloud inventory?'
        }
        message={
          deviceCategory === 'access_control'
            ? 'This permanently deletes the access control row and group memberships. The gateway will be notified to stop reporting this device; if offline, the tombstone is delivered on reconnect.'
            : device.unit_id
              ? `This permanently deletes the lock row (including its assignment to unit ${device.unit_number ?? ''}), group memberships, and denylist entries. The gateway will be notified to stop reporting this device; if offline, the tombstone is delivered on reconnect. Route passes already issued expire on schedule.`
              : 'This permanently deletes the lock row, group memberships, and denylist entries. The gateway will be notified to stop reporting this device; if offline, the tombstone is delivered on reconnect. Route passes already issued expire on schedule.'
        }
        confirmText="Remove from inventory"
        variant="danger"
        isLoading={removingFromInventory}
      />

      <EditDeviceMetadataModal
        isOpen={showEditMetadataModal}
        onClose={() => setShowEditMetadataModal(false)}
        onSuccess={(sideEffects?: DeviceMetadataSideEffects) => {
          void loadDeviceDetails();
          const toast = formatMetadataSideEffectsToast(sideEffects);
          addToast({
            type: 'success',
            title: toast.title,
            ...(toast.message ? { message: toast.message } : {}),
          });
        }}
        device={
          device && deviceCategory
            ? {
                id: device.id,
                category: deviceCategory,
                device_serial: device.device_serial,
                serial: device.serial,
                relay_channel: device.relay_channel,
                name: device.name,
                location_description: device.location_description,
                device_type: device.device_type,
                access_methods: device.access_methods,
                supports_remote_lock: device.supports_remote_lock,
                firmware_version: device.firmware_version,
                device_settings: device.device_settings,
                metadata: device.metadata,
                unit_number: device.unit_number,
                lock_status: device.lock_status,
                device_status: device.device_status,
                battery_level: device.battery_level,
                signal_strength: device.signal_strength,
                temperature: device.temperature,
                last_seen: device.last_seen,
              }
            : null
        }
      />
      {promptDialog}
    </DetailsPageShell>
  );
}

