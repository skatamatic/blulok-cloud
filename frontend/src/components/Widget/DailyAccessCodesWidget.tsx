import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { apiService } from '@/services/api.service';
import { Facility, UserAccessCode } from '@/types/facility.types';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { useToast } from '@/contexts/ToastContext';
import { DashboardFacilityScopePlaceholder } from '@/components/Widget/DashboardFacilityScopePlaceholder';
import {
  DailyAccessCodeEntry,
  formatAccessCodeExpiry,
  groupDailyAccessCodes,
  limitDailyAccessCodeGroups,
  sharedValidUntil,
} from '@/utils/daily-access-codes.utils';
import { getWidgetLayoutProfile, WIDGET_LIST_SCROLL_CLASS } from '@/utils/widget-layout.utils';

interface DailyAccessCodesWidgetProps {
  currentSize: WidgetSize;
  onSizeChange?: (size: WidgetSize) => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

export const DailyAccessCodesWidget: React.FC<DailyAccessCodesWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
  readOnly = false,
}) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const { selectedFacilityId, selectedFacility, isAllFacilitiesSelected } = useGlobalFacility();
  const [entries, setEntries] = useState<DailyAccessCodeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);

  const availableSizes: WidgetSize[] = ['small', 'medium', 'medium-tall', 'large'];
  const layout = getWidgetLayoutProfile(currentSize);
  const isAdminLike = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(
    authState.user?.role as UserRole,
  );

  const loadCodes = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setPartialWarning(null);

      if (isAllFacilitiesSelected) {
        setEntries([]);
        return;
      }

      let collected: DailyAccessCodeEntry[] = [];

      if (isAdminLike && isAllFacilitiesSelected) {
        const facilitiesResponse = await apiService.getFacilities();
        const facilities = facilitiesResponse?.facilities || [];
        const perFacility = await Promise.allSettled(
          facilities.map(async (facility: Facility) => {
            const res = await apiService.getAppAccessCodes(facility.id);
            const data = (res?.data || []) as UserAccessCode[];
            return data.map((entry) => ({
              ...entry,
              facility_id: facility.id,
              facility_name: facility.name,
            }));
          }),
        );
        const fulfilled = perFacility.filter((result): result is PromiseFulfilledResult<DailyAccessCodeEntry[]> => (
          result.status === 'fulfilled'
        ));
        const rejectedCount = perFacility.length - fulfilled.length;
        collected = fulfilled.flatMap((result) => result.value);
        if (rejectedCount > 0) {
          const warning = `Some facilities failed to load (${rejectedCount}/${perFacility.length}).`;
          setPartialWarning(warning);
          addToast({
            type: 'warning',
            title: warning,
          });
        }
        if (fulfilled.length === 0 && facilities.length > 0) {
          setError('Failed to load access codes');
        }
      } else if (selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID) {
        const res = await apiService.getAppAccessCodes(selectedFacilityId);
        collected = ((res?.data || []) as UserAccessCode[]).map((entry) => ({
          ...entry,
          facility_id: selectedFacilityId,
          facility_name: selectedFacility?.name,
        }));
      } else {
        const res = await apiService.getAppAccessCodes();
        collected = (res?.data || []) as DailyAccessCodeEntry[];
      }

      setEntries(collected);
    } catch (err) {
      console.error('Error loading daily access codes:', err);
      setError('Failed to load access codes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast, isAdminLike, isAllFacilitiesSelected, selectedFacilityId, selectedFacility?.name]);

  useEffect(() => {
    loadCodes().catch(() => undefined);
  }, [loadCodes, authState.user?.id]);

  const handleCopy = async (code: string, label: string) => {
    try {
      await navigator.clipboard.writeText(code);
      addToast({ type: 'success', title: `${label} code copied` });
    } catch {
      addToast({ type: 'error', title: 'Failed to copy access code' });
    }
  };

  const { groups: displayedGroups, hiddenCount } = useMemo(() => {
    const grouped = groupDailyAccessCodes(entries);
    return limitDailyAccessCodeGroups(grouped, layout.listCap);
  }, [entries, layout.listCap]);

  const showFacilityNames = useMemo(
    () => new Set(entries.map((entry) => entry.facility_id).filter(Boolean)).size > 1,
    [entries],
  );

  if (isAllFacilitiesSelected) {
    return (
      <Widget
        id="daily-access-codes-widget-scope"
        title="Daily Access Codes"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
      >
        <DashboardFacilityScopePlaceholder
          icon={KeyIcon}
          title="Select a facility"
          message="Choose a facility from the header to view daily access codes for that site."
        />
      </Widget>
    );
  }

  if (loading) {
    return (
      <Widget
        id="daily-access-codes-widget-loading"
        title="Daily Access Codes"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
      >
        <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
          Loading...
        </div>
      </Widget>
    );
  }

  if (error) {
    return (
      <Widget
        id="daily-access-codes-widget-error"
        title="Daily Access Codes"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-red-500">
          <ExclamationTriangleIcon className="h-8 w-8" />
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={() => loadCodes(true)}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
          >
            <ArrowPathIcon className="h-3 w-3" />
            Retry
          </button>
        </div>
      </Widget>
    );
  }

  return (
    <Widget
      id="daily-access-codes-widget"
      title="Daily Access Codes"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
      readOnly={readOnly}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-1.5 flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={() => loadCodes(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <KeyIcon className="mb-2 h-8 w-8" />
            <p className="text-sm">No active keypad codes in scope</p>
            {partialWarning && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{partialWarning}</p>
            )}
          </div>
        ) : (
          <div className={`${WIDGET_LIST_SCROLL_CLASS} space-y-2.5 pr-0.5`}>
            {partialWarning && (
              <p className="text-xs text-amber-600 dark:text-amber-300">{partialWarning}</p>
            )}

            {displayedGroups.map((typeGroup) => (
              <section key={typeGroup.deviceType} aria-label={typeGroup.label}>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  {typeGroup.label}
                </h3>
                <div className="overflow-hidden rounded-md border border-gray-200/80 bg-gray-50/70 dark:border-gray-700/70 dark:bg-gray-800/40">
                  {typeGroup.devices.map((device, deviceIndex) => {
                    const deviceValidUntil = sharedValidUntil(device.schedules);

                    return (
                      <div
                        key={`${device.facilityId || 'scope'}-${device.deviceId}`}
                        className={`px-2 py-1.5 ${
                          deviceIndex > 0
                            ? 'border-t border-gray-200/80 dark:border-gray-700/70'
                            : ''
                        }`}
                      >
                        <div className="mb-0.5 flex min-w-0 items-baseline gap-1.5">
                          <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                            {device.deviceName}
                          </p>
                          {showFacilityNames && device.facilityName && (
                            <span className="shrink-0 truncate text-[10px] text-gray-400 dark:text-gray-500">
                              {device.facilityName}
                            </span>
                          )}
                        </div>

                        <ul className="space-y-0.5">
                          {device.schedules.map((schedule) => (
                            <li
                              key={`${device.deviceId}-${schedule.scheduleId || schedule.scheduleName}`}
                              className="group flex items-center gap-2 rounded-sm px-0.5 py-0.5 transition-colors hover:bg-white/70 dark:hover:bg-gray-900/30"
                            >
                              <span
                                className="min-w-0 flex-1 truncate text-[11px] text-gray-600 dark:text-gray-400"
                                title={schedule.scheduleName}
                              >
                                {schedule.scheduleName}
                              </span>
                              <span className="shrink-0 font-mono text-sm tracking-[0.18em] text-[#147FD4] dark:text-primary-300">
                                {schedule.code}
                              </span>
                              <button
                                type="button"
                                aria-label={`Copy ${schedule.scheduleName} code for ${device.deviceName}`}
                                onClick={() => handleCopy(schedule.code, schedule.scheduleName)}
                                className="shrink-0 rounded p-0.5 text-gray-400 opacity-70 transition-all hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                              >
                                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>

                        {deviceValidUntil ? (
                          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                            Valid until {formatAccessCodeExpiry(deviceValidUntil)}
                          </p>
                        ) : (
                          device.schedules.map((schedule) => (
                            <p
                              key={`${schedule.scheduleId || schedule.scheduleName}-expiry`}
                              className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500"
                            >
                              {schedule.scheduleName}: until {formatAccessCodeExpiry(schedule.validUntil)}
                            </p>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {hiddenCount > 0 && (
              <p className="text-center text-[10px] text-gray-400 dark:text-gray-500">
                +{hiddenCount} more schedule{hiddenCount === 1 ? '' : 's'} — resize widget to see more
              </p>
            )}
          </div>
        )}
      </div>
    </Widget>
  );
};
