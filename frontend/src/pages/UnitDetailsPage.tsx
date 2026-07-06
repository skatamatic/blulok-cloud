import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { EditUnitModal } from '@/components/Units/EditUnitModal';
import { DeviceAssignmentModal } from '@/components/Devices/DeviceAssignmentModal';
import {
  HomeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
  PencilIcon,
  TrashIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { useDetailsBackNavigation, replaceSearchParams, withReturnPath } from '@/hooks/useBackNavigation';
import {
  DetailsPageHeader,
  DetailsPageLoading,
  DetailsPageNotFound,
  DetailsPageShell,
  DetailsTabNav,
} from '@/components/Common/DetailsPageLayout';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { detailsBtnDangerSm, detailsBtnSecondarySm, detailsTabCountBadgeClass, detailsUnlockButtonClass } from '@/components/Common/details-page.styles';
import {
  deviceStatusColors,
  lockStatusColors,
  unitStatusColors,
} from '@/utils/statusBadge.utils';
import { UnitDetailsOverview, type UnitDetailsTab } from '@/components/Units/UnitDetailsOverview';
import type { UnitAccessGroupRef } from '@/utils/device-group-membership.utils';
import { loadAccessGroupRefsForBlulokLock } from '@/utils/access-groups-load.utils';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { resolveLockTimeoutMsForUnit } from '@/utils/facilityLockTimeout.utils';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { useToast } from '@/contexts/ToastContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import type { LockDeviceSnapshot } from '@/utils/deviceStatusWs.utils';

interface UnitDetails {
  id: string;
  unit_number: string;
  unit_type: string;
  status: 'available' | 'occupied' | 'overlocked' | 'maintenance' | 'reserved';
  is_overlocked?: boolean;
  facility_id: string;
  facility_name: string;
  facility_address: string;
  facility_lock_command_timeout_sec?: number | null;
  description?: string;
  features?: string[];
  device_status?: 'online' | 'offline' | 'low_battery' | 'error';
  reported_device_status?: 'online' | 'offline' | 'low_battery' | 'error';
  status_unreachable_reason?: string | null;
  blulok_device?: {
    id: string;
    device_serial: string;
    firmware_version?: string;
    lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
    device_status: 'online' | 'offline' | 'low_battery' | 'error';
    reported_device_status?: 'online' | 'offline' | 'low_battery' | 'error';
    status_unreachable_reason?: string | null;
    battery_level?: number;
    last_activity?: string;
    last_seen?: string;
    // Telemetry fields
    signal_strength?: number;
    temperature?: number;
    error_code?: string | null;
    error_message?: string | null;
    device_settings?: Record<string, unknown>;
  };
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  shared_tenants?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    access_type: 'full' | 'shared' | 'temporary';
    access_granted_at: string;
    access_expires_at?: string;
  }>;
  access_groups?: UnitAccessGroupRef[];
  created_at: string;
  updated_at: string;
}

const statusColors = unitStatusColors;

const statusIcons = {
  available: CheckCircleIcon,
  occupied: HomeIcon,
  overlocked: ShieldExclamationIcon,
  maintenance: WrenchScrewdriverIcon,
  reserved: ClockIcon
};

const deviceStatusIcons = {
  online: CheckCircleIcon,
  offline: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
  low_battery: ExclamationTriangleIcon
};


function getUnitTabFromSearch(search: string): UnitDetailsTab {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'tenant' || tab === 'device') return tab;
  return 'overview';
}

export default function UnitDetailsPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const { authState } = useAuth();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { goBack, showBack, backLabel } = useDetailsBackNavigation({ fallbackPath: '/units' });
  const [unit, setUnit] = useState<UnitDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManageUnits = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const canChangePrimaryTenant = canManageUnits; // Only admins can change primary tenant
  const isPrimaryTenant = unit?.primary_tenant?.id === authState.user?.id;
  const canManageSharedAccess = canManageUnits || isPrimaryTenant; // Primary tenant can manage shared access

  const [assigningTenant, setAssigningTenant] = useState(false);

  const [removingTenant, setRemovingTenant] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPrimaryTenant, setSelectedPrimaryTenant] = useState<string>('');
  const [selectedSharedTenant, setSelectedSharedTenant] = useState<string>('');
  const [showAddSharedAccess, setShowAddSharedAccess] = useState(false);
  const [showPrimaryTenantChange, setShowPrimaryTenantChange] = useState(false);
  const [showDeviceAssignmentModal, setShowDeviceAssignmentModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemovePrimaryConfirm, setShowRemovePrimaryConfirm] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [overlockSaving, setOverlockSaving] = useState(false);
  const [accessGroups, setAccessGroups] = useState<UnitAccessGroupRef[]>([]);
  const [activeTab, setActiveTab] = useState<UnitDetailsTab>(() => getUnitTabFromSearch(location.search));
  const unitLockStatusRef = useRef<string | undefined>(undefined);
  const { facilities: globalFacilities, selectedFacility } = useGlobalFacility();
  const { requestUnlock, isSubmitting, syncLockStatus } = useRemoteUnlockAction({
    timeoutToast: lockHardwareFeedbackToasts.unitUnlockTimeout,
  });

  unitLockStatusRef.current = unit?.blulok_device?.lock_status;

  useEffect(() => {
    if (unitId && unit?.blulok_device?.lock_status) {
      syncLockStatus(unitId, unit.blulok_device.lock_status);
    }
  }, [unitId, unit?.blulok_device?.lock_status, syncLockStatus]);

  useEffect(() => {
    setActiveTab(getUnitTabFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    if (unitId) {
      loadUnitDetails();
    }
  }, [unitId]);

  useEffect(() => {
    const loadAccessGroups = async () => {
      if (!unit?.facility_id || !unit?.blulok_device?.id || !unitId) {
        setAccessGroups(unit?.access_groups || []);
        return;
      }

      try {
        const refs = await loadAccessGroupRefsForBlulokLock(
          unit.facility_id,
          unit.blulok_device.id,
          unitId,
        );
        setAccessGroups(refs);
      } catch (error) {
        console.error('Failed to load unit access groups:', error);
        setAccessGroups(unit.access_groups || []);
      }
    };

    void loadAccessGroups();
  }, [unit?.facility_id, unit?.blulok_device?.id, unitId, unit?.access_groups]);

  const handleTabChange = (tab: UnitDetailsTab) => {
    setActiveTab(tab);
    replaceSearchParams(navigate, location, (params) => {
      params.set('tab', tab);
    });
  };

  const mergeBlulokFromSnapshots = useCallback((rows: LockDeviceSnapshot[]) => {
    if (rows.length === 0) return;
    const deviceUpdate = rows[0];
    setUnit((prev) => {
      if (!prev?.blulok_device) return prev;
      return {
        ...prev,
        device_status: (deviceUpdate.device_status ??
          prev.device_status ??
          prev.blulok_device.device_status) as NonNullable<UnitDetails['device_status']>,
        reported_device_status:
          deviceUpdate.reported_device_status ??
          prev.reported_device_status ??
          prev.blulok_device.reported_device_status ??
          prev.blulok_device.device_status,
        status_unreachable_reason:
          deviceUpdate.status_unreachable_reason !== undefined
            ? deviceUpdate.status_unreachable_reason
            : prev.status_unreachable_reason ?? prev.blulok_device.status_unreachable_reason,
        blulok_device: {
          ...prev.blulok_device,
          lock_status: (deviceUpdate.lock_status || prev.blulok_device.lock_status) as NonNullable<
            UnitDetails['blulok_device']
          >['lock_status'],
          device_status: (deviceUpdate.device_status || prev.blulok_device.device_status) as NonNullable<
            UnitDetails['blulok_device']
          >['device_status'],
          reported_device_status:
            deviceUpdate.reported_device_status ??
            prev.blulok_device.reported_device_status ??
            prev.blulok_device.device_status,
          status_unreachable_reason:
            deviceUpdate.status_unreachable_reason !== undefined
              ? deviceUpdate.status_unreachable_reason
              : prev.blulok_device.status_unreachable_reason,
          battery_level: deviceUpdate.battery_level ?? prev.blulok_device.battery_level,
          signal_strength: deviceUpdate.signal_strength ?? prev.blulok_device.signal_strength,
          temperature:
            deviceUpdate.temperature !== undefined && deviceUpdate.temperature !== null
              ? (() => {
                  const temp =
                    typeof deviceUpdate.temperature === 'number'
                      ? deviceUpdate.temperature
                      : Number(deviceUpdate.temperature);
                  return Number.isNaN(temp) ? prev.blulok_device!.temperature : temp;
                })()
              : prev.blulok_device.temperature,
          error_code: deviceUpdate.error_code !== undefined ? deviceUpdate.error_code : prev.blulok_device.error_code,
          error_message:
            deviceUpdate.error_message !== undefined ? deviceUpdate.error_message : prev.blulok_device.error_message,
          firmware_version: deviceUpdate.firmware_version ?? prev.blulok_device.firmware_version,
          last_activity: deviceUpdate.last_activity ?? prev.blulok_device.last_activity,
          last_seen: deviceUpdate.last_seen || prev.blulok_device.last_seen,
          ...(deviceUpdate.device_settings !== undefined
            ? { device_settings: deviceUpdate.device_settings }
            : deviceUpdate.name !== undefined
              ? {
                  device_settings: {
                    ...(prev.blulok_device.device_settings ?? {}),
                    displayName: deviceUpdate.name,
                  },
                }
              : {}),
        },
      };
    });
  }, []);

  useLockDeviceRealtime({
    enabled: !!unit?.blulok_device?.id,
    deviceId: unit?.blulok_device?.id,
    facilityId: unit?.facility_id,
    onDeviceRows: mergeBlulokFromSnapshots,
    debouncedRefresh: () => {
      void loadUnitDetails();
    },
    subscribeUnitsForRefresh: false,
  });

  const loadUnitDetails = async () => {
    if (!unitId) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getUnitDetails(unitId);
      setUnit(response.unit);
    } catch (error) {
      console.error('Failed to load unit details:', error);
      setError('Failed to load unit details. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleAssignTenant = async (tenantId: string, isPrimary: boolean) => {
    if (!unitId) return;

    try {
      setAssigningTenant(true);
      await apiService.assignTenantToUnit(unitId, tenantId, isPrimary);
      await loadUnitDetails(); // Refresh unit data
      
      // Show success notification (you can add a toast notification here)
      console.log(`Tenant ${isPrimary ? 'assigned as primary' : 'granted shared access'} successfully`);
    } catch (error: any) {
      console.error('Failed to assign tenant:', error);
      // Show error notification
      const errorMessage = error.response?.data?.message || 'Failed to assign tenant. Please try again.';
      addToast({ type: 'error', title: 'Assignment failed', message: errorMessage });
    } finally {
      setAssigningTenant(false);
    }
  };

  const handleRemoveTenant = async (tenantId: string) => {
    if (!unitId) return;

    try {
      setRemovingTenant(tenantId);
      await apiService.removeTenantFromUnit(unitId, tenantId);
      await loadUnitDetails(); // Refresh unit data

      addToast({ type: 'success', title: 'Tenant removed', message: 'Unit access was revoked for this tenant.' });
    } catch (error: any) {
      console.error('Failed to remove tenant:', error);
      // Show error notification
      const errorMessage = error.response?.data?.message || 'Failed to remove tenant. Please try again.';
      addToast({ type: 'error', title: 'Removal failed', message: errorMessage });
    } finally {
      setRemovingTenant(null);
    }
  };

  const handleDeleteUnit = async () => {
    if (!unitId) return;

    try {
      setDeletingUnit(true);
      await apiService.deleteUnit(unitId);
      addToast({ type: 'success', title: 'Unit deleted', message: `Unit ${unit?.unit_number ?? ''} was removed.` });
      setShowDeleteConfirm(false);
      navigate('/units');
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      addToast({
        type: 'error',
        title: 'Delete failed',
        message: apiError?.response?.data?.message || 'Failed to delete unit. Please try again.',
      });
    } finally {
      setDeletingUnit(false);
    }
  };

  const buildDeleteUnitMessage = () => {
    if (!unit) return '';
    const tenantCount = (unit.primary_tenant ? 1 : 0) + (unit.shared_tenants?.length ?? 0);
    const impactParts: string[] = [];
    if (tenantCount > 0) {
      impactParts.push(`${tenantCount} tenant assignment${tenantCount === 1 ? '' : 's'} will be removed`);
    }
    if (unit.blulok_device) {
      impactParts.push('the linked lock will be detached');
    }
    impactParts.push('active route passes will be revoked');
    const impact = impactParts.length > 0 ? ` ${impactParts.join(', ')}.` : '';
    return `Permanently delete Unit ${unit.unit_number}?${impact} This cannot be undone.`;
  };

  const handleToggleOverlock = async (next: boolean) => {
    if (!unitId) return;
    setOverlockSaving(true);
    try {
      const response = await apiService.setUnitOverlock(unitId, next);
      const updated = response?.unit ?? response;
      setUnit((prev) =>
        prev
          ? {
              ...prev,
              status: updated?.status ?? (next ? 'overlocked' : 'occupied'),
              is_overlocked: Boolean(updated?.is_overlocked ?? next),
            }
          : prev,
      );
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

  const handleRemoteUnlock = async () => {
    if (!unit?.blulok_device || !unitId || !canRequestRemoteUnlock(unit.blulok_device.lock_status)) return;

    const previousStatus = unit.blulok_device.lock_status ?? 'locked';
    let clearTransitionalAfterRefresh = false;

    const patchLockStatus = (lockStatus: string) => {
      setUnit((prev) =>
        prev?.blulok_device
          ? { ...prev, blulok_device: { ...prev.blulok_device, lock_status: lockStatus as typeof prev.blulok_device.lock_status } }
          : prev,
      );
    };

    const refreshAfterUnlockAttempt = async () => {
      await loadUnitDetails();
      if (!clearTransitionalAfterRefresh) return;
      clearTransitionalAfterRefresh = false;
      setUnit((prev) => {
        if (!prev?.blulok_device) return prev;
        const status = prev.blulok_device.lock_status;
        if (status === 'unlocking' || status === 'locking') {
          return {
            ...prev,
            blulok_device: {
              ...prev.blulok_device,
              lock_status: previousStatus as typeof prev.blulok_device.lock_status,
            },
          };
        }
        return prev;
      });
    };

    await requestUnlock({
      deviceId: unit.blulok_device.id,
      watchKey: unitId,
      timeoutMs: resolveLockTimeoutMsForUnit(unit, globalFacilities, selectedFacility),
      getLockStatus: () => unitLockStatusRef.current,
      applyOptimisticUnlocking: () => {
        patchLockStatus('unlocking');
      },
      revertOptimisticLockStatus: (status) => {
        clearTransitionalAfterRefresh = true;
        patchLockStatus(status);
      },
      refresh: refreshAfterUnlockAttempt,
    });
  };

  if (loading) {
    return <DetailsPageLoading />;
  }

  if (error || !unit) {
    return (
      <DetailsPageNotFound
        title="Unit not found"
        message={error || 'The unit you are looking for does not exist or you do not have access to it.'}
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
      />
    );
  }

  const StatusIcon = statusIcons[unit.status];
  const sharedTenantCount = unit.shared_tenants?.length ?? 0;

  const unitTabs = [
    { key: 'overview', label: 'Overview' },
    {
      key: 'tenant',
      label: 'Tenant & Sharing',
      badge:
        sharedTenantCount > 0 ? (
          <span className={detailsTabCountBadgeClass}>
            {sharedTenantCount}
          </span>
        ) : undefined,
    },
    { key: 'device', label: 'Device' },
  ];

  return (
    <DetailsPageShell>
      <DetailsPageHeader
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
        title={`Unit ${unit.unit_number}`}
        subtitle={<span className="capitalize">{unit.unit_type}</span>}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/facilities/${unit.facility_id}`}
              state={withReturnPath(location)}
              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <BuildingOfficeIcon className="mr-1 h-3.5 w-3.5" />
              {unit.facility_name}
            </Link>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[unit.status]}`}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              {unit.status}
            </span>
          </div>
        }
        actions={
          canManageUnits ? (
            <>
              {unit.blulok_device && (
                <button
                  type="button"
                  disabled={
                    isSubmitting(unitId) ||
                    (!canRequestRemoteUnlock(unit.blulok_device.lock_status) &&
                      !isLockTransitionPending(unit.blulok_device.lock_status))
                  }
                  onClick={() => void handleRemoteUnlock()}
                  className={detailsUnlockButtonClass({
                    pending:
                      isLockTransitionPending(unit.blulok_device.lock_status) || isSubmitting(unitId),
                    canUnlock: canRequestRemoteUnlock(unit.blulok_device.lock_status),
                  })}
                >
                  {isLockTransitionPending(unit.blulok_device.lock_status) || isSubmitting(unitId)
                    ? 'Unlocking…'
                    : canRequestRemoteUnlock(unit.blulok_device.lock_status)
                      ? 'Unlock'
                      : 'Unlocked'}
                </button>
              )}
              <button
                onClick={() => setShowEditModal(true)}
                className={detailsBtnSecondarySm}
              >
                <PencilIcon className="h-4 w-4 mr-2" />
                Edit Unit
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deletingUnit}
                className={detailsBtnDangerSm}
              >
                <TrashIcon className="h-4 w-4 mr-2" />
                Delete Unit
              </button>
            </>
          ) : undefined
        }
      />

      <DetailsTabNav
        tabs={unitTabs}
        activeKey={activeTab}
        onChange={(key) => handleTabChange(key as UnitDetailsTab)}
      />

      <UnitDetailsOverview
        activeTab={activeTab}
        unit={unit}
        accessGroups={accessGroups}
        location={location}
        unitId={unitId}
        statusColors={statusColors}
        lockStatusColors={lockStatusColors}
        deviceStatusColors={deviceStatusColors}
        deviceStatusIcons={deviceStatusIcons}
        canManageUnits={canManageUnits}
        canManageOverlock={canManageUnits}
        overlockSaving={overlockSaving}
        onToggleOverlock={(next) => void handleToggleOverlock(next)}
        canChangePrimaryTenant={canChangePrimaryTenant}
        canManageSharedAccess={canManageSharedAccess}
        assigningTenant={assigningTenant}
        removingTenant={removingTenant}
        showPrimaryTenantChange={showPrimaryTenantChange}
        showAddSharedAccess={showAddSharedAccess}
        selectedPrimaryTenant={selectedPrimaryTenant}
        selectedSharedTenant={selectedSharedTenant}
        currentUserId={authState.user?.id}
        isSubmittingUnlock={Boolean(unitId && isSubmitting(unitId))}
        onAssignPrimary={() => {
          if (selectedPrimaryTenant) {
            void handleAssignTenant(selectedPrimaryTenant, true);
            setShowPrimaryTenantChange(false);
            setSelectedPrimaryTenant('');
          }
        }}
        onRemoveTenant={(tenantId) => void handleRemoveTenant(tenantId)}
        onRequestRemovePrimaryTenant={
          unit.primary_tenant ? () => setShowRemovePrimaryConfirm(true) : undefined
        }
        onRemoteUnlock={() => void handleRemoteUnlock()}
        onAssignDevice={() => setShowDeviceAssignmentModal(true)}
        onChangeDevice={() => setShowDeviceAssignmentModal(true)}
        onSharedAccessChanged={() => void loadUnitDetails()}
        onGoToTenantTab={() => {
          handleTabChange('tenant');
          if (canChangePrimaryTenant) {
            setShowPrimaryTenantChange(true);
          }
        }}
        setShowPrimaryTenantChange={setShowPrimaryTenantChange}
        setShowAddSharedAccess={setShowAddSharedAccess}
        setSelectedPrimaryTenant={setSelectedPrimaryTenant}
        setSelectedSharedTenant={setSelectedSharedTenant}
        onAssignShared={async () => {
          await handleAssignTenant(selectedSharedTenant, false);
          setShowAddSharedAccess(false);
          setSelectedSharedTenant('');
        }}
      />

      {/* Edit Unit Modal */}
      <EditUnitModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          setShowEditModal(false);
          loadUnitDetails(); // Refresh unit data
        }}
        unit={unit}
      />

      {/* Device Assignment Modal */}
      <DeviceAssignmentModal
        isOpen={showDeviceAssignmentModal}
        onClose={() => setShowDeviceAssignmentModal(false)}
        onSuccess={() => {
          setShowDeviceAssignmentModal(false);
          loadUnitDetails(); // Refresh unit data
        }}
        unit={unit}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete unit?"
        message={buildDeleteUnitMessage()}
        confirmLabel="Delete unit"
        confirmTone="danger"
        isLoading={deletingUnit}
        onConfirm={() => void handleDeleteUnit()}
        onCancel={() => {
          if (!deletingUnit) setShowDeleteConfirm(false);
        }}
      />

      <ConfirmDialog
        isOpen={showRemovePrimaryConfirm}
        title="Remove primary tenant?"
        message={
          unit.primary_tenant
            ? `Remove ${unit.primary_tenant.first_name} ${unit.primary_tenant.last_name} from Unit ${unit.unit_number}? Their route pass access to this unit will be revoked. You can assign a different tenant afterward.`
            : ''
        }
        confirmLabel="Remove tenant"
        confirmTone="danger"
        isLoading={Boolean(unit.primary_tenant && removingTenant === unit.primary_tenant.id)}
        onConfirm={() => {
          if (!unit.primary_tenant) return;
          void handleRemoveTenant(unit.primary_tenant.id).finally(() => {
            setShowRemovePrimaryConfirm(false);
          });
        }}
        onCancel={() => {
          if (!unit.primary_tenant || removingTenant !== unit.primary_tenant.id) {
            setShowRemovePrimaryConfirm(false);
          }
        }}
      />
    </DetailsPageShell>
  );
}

