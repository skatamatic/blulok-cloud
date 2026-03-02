import React, { useCallback, useEffect, useState } from 'react';
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

interface DailyAccessCodeEntry extends UserAccessCode {
  facility_id?: string;
  facility_name?: string;
}

interface DailyAccessCodesWidgetProps {
  currentSize: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onRemove?: () => void;
}

export const DailyAccessCodesWidget: React.FC<DailyAccessCodesWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
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
  const isAdminLike = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(
    authState.user?.role as UserRole,
  );

  const maxItems = (() => {
    switch (currentSize) {
      case 'small':
        return 2;
      case 'medium':
        return 4;
      case 'medium-tall':
        return 7;
      case 'large':
        return 10;
      default:
        return 4;
    }
  })();

  const loadCodes = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setPartialWarning(null);

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

      collected.sort((a, b) => {
        const byFacility = (a.facility_name || '').localeCompare(b.facility_name || '');
        if (byFacility !== 0) return byFacility;
        return a.device_name.localeCompare(b.device_name);
      });

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

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      addToast({ type: 'success', title: 'Access code copied' });
    } catch {
      addToast({ type: 'error', title: 'Failed to copy access code' });
    }
  };

  const displayed = entries.slice(0, maxItems);

  if (loading) {
    return (
      <Widget
        id="daily-access-codes-widget-loading"
        title="Daily Access Codes"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
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
    >
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isAdminLike && isAllFacilitiesSelected ? 'All facilities' : (selectedFacility?.name || 'Current scope')}
          </p>
          <button
            type="button"
            onClick={() => loadCodes(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {displayed.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <KeyIcon className="mb-2 h-8 w-8" />
            <p className="text-sm">No active keypad codes in scope</p>
            {partialWarning && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{partialWarning}</p>
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Codes are resolved from device groups and device-specific assignments.
            </p>
            {partialWarning && (
              <p className="text-xs text-amber-600 dark:text-amber-300">{partialWarning}</p>
            )}
            {displayed.map((entry) => (
              <div
                key={`${entry.facility_id || 'scope'}-${entry.device_id}-${entry.schedule_id || 'default'}`}
                className="rounded-md border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.device_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.device_type}
                      {entry.location_description ? ` • ${entry.location_description}` : ''}
                      {entry.facility_name ? ` • ${entry.facility_name}` : ''}
                      {` • ${entry.schedule_name || 'Always-on'}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-base tracking-widest text-primary-700 dark:text-primary-300">
                      {entry.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(entry.code)}
                      className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Valid until {new Date(entry.valid_until).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Widget>
  );
};

