import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { LockClosedIcon, LockOpenIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Unit } from '@/types/units.types';
import { UserRole } from '@/types/auth.types';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { LockDeviceSnapshot } from '@/utils/deviceStatusWs.utils';
import { getScopedFacilityId } from '@/utils/globalFacilityScope.utils';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';
import { getWidgetLayoutProfile, WIDGET_LIST_SCROLL_CLASS } from '@/utils/widget-layout.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { requiresOccupiedUnitOverride } from '@/constants/tenantUnlockOverride.constants';
import { resolveLockTimeoutMsForUnit } from '@/utils/facilityLockTimeout.utils';
import { formatRelativeTime, RELATIVE_LAST_SEEN_OPTS } from '@/utils/datetime.utils';

interface LockStatusWidgetProps {
  currentSize: WidgetSize;
  onSizeChange?: (size: WidgetSize) => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

/** GET /units/my is tenant-only; admin list rows use device_status / last_activity field names */
function normalizeUnitForLockWidget(unit: Unit & { last_activity?: string }): Unit {
  const deviceStatus =
    unit.device_status ??
    (unit.blulok_device as { device_status?: Unit['device_status'] } | undefined)?.device_status;
  const isOnline =
    unit.is_online ??
    (deviceStatus === 'online' || deviceStatus === 'low_battery');
  return {
    ...unit,
    is_online: Boolean(isOnline),
    last_seen: unit.last_seen ?? unit.last_activity,
    lock_status: (unit.lock_status ?? unit.blulok_device?.lock_status) as Unit['lock_status'],
  };
}

export const LockStatusWidget: React.FC<LockStatusWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
  readOnly = false,
}) => {
  const { authState } = useAuth();
  const { selectedFacilityId, isLoading: facilitiesLoading, facilities: globalFacilities } = useGlobalFacility();
  const scopedFacilityId = getScopedFacilityId(selectedFacilityId);
  const { isConnected } = useWebSocket();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['small', 'medium', 'large', 'medium-tall'];
  const fetchRequestIdRef = useRef(0);
  const unitsRef = useRef<Unit[]>([]);
  unitsRef.current = units;
  const { requestUnlock, isSubmitting, syncLockStatus, tenantOverrideDialog } = useRemoteUnlockAction({
    timeoutToast: lockHardwareFeedbackToasts.unitUnlockTimeout,
    errorToast: () => ({
      type: 'error' as const,
      title: 'Could not update lock',
    }),
  });

  const fetchUnits = useCallback(async (opts?: { background?: boolean }) => {
    const requestId = ++fetchRequestIdRef.current;

    try {
      if (!opts?.background) {
        setLoading(true);
      }
      setError(null);

      const role = authState.user?.role;
      const isTenant = role === UserRole.TENANT;

      // /units/my is restricted to tenants (requireRoles TENANT). Staff use GET /units with RBAC in UnitsService.
      const response = isTenant
        ? await apiService.getMyUnits()
        : await apiService.getUnits({
            limit: 500,
            ...(scopedFacilityId ? { facility_id: scopedFacilityId } : {}),
          });

      if (requestId !== fetchRequestIdRef.current) return;

      let rows = (response.units || []) as Array<Unit & { last_activity?: string }>;
      if (isTenant && scopedFacilityId) {
        rows = rows.filter((u) => u.facility_id === scopedFacilityId);
      }
      setUnits(rows.map(normalizeUnitForLockWidget));
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      console.error('Error fetching units:', err);
      if (!opts?.background) {
        setError('Failed to load units');
      }
    } finally {
      if (requestId === fetchRequestIdRef.current && !opts?.background) {
        setLoading(false);
      }
    }
  }, [authState.user?.role, scopedFacilityId]);

  const fetchUnitsRef = useRef(fetchUnits);
  fetchUnitsRef.current = fetchUnits;

  useEffect(() => {
    if (facilitiesLoading) return;
    void fetchUnits();
  }, [fetchUnits, facilitiesLoading]);

  const mergeLockSnapshots = useCallback((updates: LockDeviceSnapshot[]) => {
    if (updates.length === 0) return;

    setUnits((prev) => {
      const updated = [...prev];
      for (const update of updates) {
        const unitId = update.unit_id;
        const index =
          unitId != null && unitId !== ''
            ? updated.findIndex((u) => u.id === unitId)
            : update.device_id
              ? updated.findIndex((u) => u.blulok_device?.id === update.device_id)
              : -1;
        if (index === -1) continue;

        const unit = updated[index];
        const nextLock =
          update.lock_status === 'locked' || update.lock_status === 'unlocked'
            ? update.lock_status
            : unit.lock_status;
        updated[index] = {
          ...unit,
          status:
            update.lock_status === 'locked'
              ? 'locked'
              : update.lock_status === 'unlocked'
                ? 'unlocked'
                : unit.status,
          ...(nextLock ? { lock_status: nextLock } : {}),
          ...(unit.blulok_device && update.lock_status
            ? {
                blulok_device: {
                  ...unit.blulok_device,
                  lock_status: update.lock_status,
                },
              }
            : {}),
          is_online:
            update.device_status === 'online' || update.device_status === 'low_battery'
              ? true
              : update.device_status === 'offline' || update.device_status === 'error'
                ? false
                : unit.is_online,
          battery_level: update.battery_level ?? unit.battery_level,
          last_seen: update.last_seen ?? unit.last_seen,
        } as Unit;
      }
      return updated;
    });
  }, []);

  useLockDeviceRealtime({
    enabled: isConnected,
    facilityId: scopedFacilityId ?? null,
    onDeviceRows: mergeLockSnapshots,
    debouncedRefresh: () => {
      void fetchUnitsRef.current({ background: true });
    },
    debounceRefreshFilter: (payload) =>
      typeof payload === 'object' &&
      payload !== null &&
      (payload as { source?: string }).source === 'units_update',
    subscribeUnitsForRefresh: true,
    subscribeDeviceStatusForRefresh: false,
  });

  const layout = getWidgetLayoutProfile(currentSize);

  const getBatteryColor = (level: number | undefined): string => {
    if (!level) return 'text-gray-500';
    if (level > 50) return 'text-green-600';
    if (level > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBatteryIcon = (level: number | undefined): string => {
    if (!level) return '🔋';
    if (level > 50) return '🔋';
    if (level > 20) return '🔋';
    return '🔋';
  };

  const deviceLockStatus = (u: Unit) =>
    u.lock_status ?? u.blulok_device?.lock_status ?? u.status;

  const deviceIdForLock = (u: Unit) => u.blulok_device?.id ?? u.device_id;

  const handleRemoteUnlock = async (unitId: string) => {
    const unit = unitsRef.current.find((u) => u.id === unitId);
    if (!unit) return;
    const deviceId = deviceIdForLock(unit);
    const ls = deviceLockStatus(unit);
    if (!deviceId || !canRequestRemoteUnlock(ls)) return;

    const previousStatus = ls ?? 'locked';
    let clearTransitionalAfterRefresh = false;

    const patchUnitLockStatus = (lockStatus: string) => {
      setUnits((prev) =>
        prev.map((u) =>
          u.id === unitId
            ? {
                ...u,
                lock_status: lockStatus as Unit['lock_status'],
                ...(u.blulok_device
                  ? { blulok_device: { ...u.blulok_device, lock_status: lockStatus } }
                  : {}),
              }
            : u,
        ),
      );
    };

    const refreshAfterUnlockAttempt = async () => {
      await fetchUnits({ background: true });
      if (!clearTransitionalAfterRefresh) return;
      clearTransitionalAfterRefresh = false;
      setUnits((prev) =>
        prev.map((u) => {
          if (u.id !== unitId) return u;
          const status = deviceLockStatus(u);
          if (status === 'unlocking' || status === 'locking') {
            return {
              ...u,
              lock_status: previousStatus as Unit['lock_status'],
              ...(u.blulok_device
                ? { blulok_device: { ...u.blulok_device, lock_status: previousStatus } }
                : {}),
            };
          }
          return u;
        }),
      );
    };

    await requestUnlock({
      deviceId,
      watchKey: unitId,
      timeoutMs: resolveLockTimeoutMsForUnit(unit, globalFacilities),
      getLockStatus: () => {
        const cur = unitsRef.current.find((u) => u.id === unitId);
        return deviceLockStatus(cur ?? unit);
      },
      applyOptimisticUnlocking: () => {
        patchUnitLockStatus('unlocking');
      },
      revertOptimisticLockStatus: (status) => {
        clearTransitionalAfterRefresh = true;
        patchUnitLockStatus(status);
      },
      refresh: refreshAfterUnlockAttempt,
      requiresTenantOverride: requiresOccupiedUnitOverride(unit, authState.user?.id),
      unitLabel: unit.unit_number,
    });
  };

  useEffect(() => {
    for (const unit of units) {
      syncLockStatus(unit.id, deviceLockStatus(unit));
    }
  }, [units, syncLockStatus]);

  const handleRetry = async () => {
    await fetchUnits();
  };

  const maxItems = layout.listCap;
  const displayUnits = units.slice(0, maxItems);
  const unlockedCount = units.filter((unit) => deviceLockStatus(unit) === 'unlocked').length;
  const lowBatteryCount = units.filter(unit => (unit.battery_level || 0) < 20).length;
  const offlineCount = units.filter(unit => !unit.is_online).length;

  if (loading) {
    return (
      <Widget
        id="lock-status-widget-loading"
        title="Lock Status"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Widget>
    );
  }

  if (error) {
    return (
      <Widget
        id="lock-status-widget-error"
        title="Lock Status"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
      >
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-red-500 text-center">
            <ExclamationTriangleIcon className="h-8 w-8 mx-auto mb-2" />
            <div className="text-sm">{error}</div>
          </div>
          <button
            onClick={handleRetry}
            className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            Try again
          </button>
        </div>
      </Widget>
    );
  }

  return (
    <Widget
      id="lock-status-widget"
      title="Lock Status"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
      readOnly={readOnly}
      enhancedMenu={
        <div className="space-y-1">
          {isConnected && (
            <div className="px-3 py-1 text-xs text-green-600 dark:text-green-400">
              ● Live updates active
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-2 h-full flex flex-col">
        {units.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <LockClosedIcon className="h-8 w-8 mx-auto mb-2" />
              <div className="text-sm">No units found</div>
            </div>
          </div>
        ) : currentSize === 'small' ? (
          // Compact view for small size
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-gray-600 dark:text-gray-300">
                {unlockedCount} unlocked
              </span>
              {lowBatteryCount > 0 && (
                <span className="text-orange-600 flex items-center space-x-1">
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  <span>{lowBatteryCount}</span>
                </span>
              )}
            </div>
            {displayUnits.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1">
                  {deviceLockStatus(unit) === 'locked' ? (
                    <LockClosedIcon className="h-3 w-3 text-green-600" />
                  ) : (
                    <LockOpenIcon className="h-3 w-3 text-red-600" />
                  )}
                  <span className="truncate">{unit.unit_number}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoteUnlock(unit.id)}
                  disabled={
                    isSubmitting(unit.id) ||
                    !deviceIdForLock(unit) ||
                    isLockTransitionPending(deviceLockStatus(unit)) ||
                    !canRequestRemoteUnlock(deviceLockStatus(unit))
                  }
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    canRequestRemoteUnlock(deviceLockStatus(unit))
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'
                  }`}
                >
                  {isSubmitting(unit.id)
                    ? '...'
                    : isLockTransitionPending(deviceLockStatus(unit))
                      ? '…'
                      : canRequestRemoteUnlock(deviceLockStatus(unit))
                        ? 'Unlock'
                        : 'Unlocked'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          // Full view for larger sizes
          <div className={`space-y-2 ${WIDGET_LIST_SCROLL_CLASS}`}>
            {/* Status Summary */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {unlockedCount}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Unlocked</div>
              </div>
              <div className="text-center p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {lowBatteryCount}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Low Battery</div>
              </div>
              <div className="text-center p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {offlineCount}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Offline</div>
              </div>
            </div>

            {/* Units List */}
            <div className="space-y-2">
              {displayUnits.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {deviceLockStatus(unit) === 'locked' ? (
                        <LockClosedIcon className="h-5 w-5 text-green-600" />
                      ) : (
                        <LockOpenIcon className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {unit.unit_number}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className={getBatteryColor(unit.battery_level)}>
                          {getBatteryIcon(unit.battery_level)} {unit.battery_level || 0}%
                        </span>
                        <span>•</span>
                        <span className={unit.is_online ? 'text-green-600' : 'text-red-600'}>
                          {unit.is_online ? 'Online' : 'Offline'}
                        </span>
                        <span>•</span>
                        <span>{formatRelativeTime(unit.last_seen, RELATIVE_LAST_SEEN_OPTS)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoteUnlock(unit.id)}
                    disabled={
                      isSubmitting(unit.id) ||
                      !deviceIdForLock(unit) ||
                      isLockTransitionPending(deviceLockStatus(unit)) ||
                      !canRequestRemoteUnlock(deviceLockStatus(unit))
                    }
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      canRequestRemoteUnlock(deviceLockStatus(unit))
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {isSubmitting(unit.id)
                      ? '...'
                      : isLockTransitionPending(deviceLockStatus(unit))
                        ? 'Unlocking…'
                        : canRequestRemoteUnlock(deviceLockStatus(unit))
                          ? 'Unlock'
                          : 'Unlocked'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {units.length > maxItems && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-600">
            Showing {maxItems} of {units.length} units
          </div>
        )}
      </div>
      {tenantOverrideDialog}
    </Widget>
  );
};
