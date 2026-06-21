import { useEffect, useMemo, useState } from 'react';
import { apiService } from '@/services/api.service';
import {
  AccessCodeGroupConfig,
  AccessControlDevice,
  DeviceGroup,
  EffectiveAccessCode,
} from '@/types/facility.types';
import { ScheduleWithTimeWindows } from '@/types/schedule.types';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { overviewFieldLabelClass, overviewSectionClass, overviewStatCardClass } from '@/components/Common/DetailsPageLayout';
import {
  detailsBtnPrimarySm,
  detailsBtnSecondarySm,
  detailsFormLabelClass,
  detailsInputClass,
  overviewAlertWarningClass,
} from '@/components/Common/details-page.styles';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  DEFAULT_GROUP_CONFIG,
  filterKeypadDevices,
  GroupMemberRef,
  UNSCHEDULED_OPTION_ID,
} from '@/components/AccessCodes/access-groups.utils';

type PendingAccessCodeConfirmation =
  | { type: 'rotate'; groupLabel: string }
  | { type: 'manual'; groupLabel: string; scheduleLabel: string; code: string; scheduleId: string };

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: string;
      response?: { data?: { message?: string; error?: string } };
    };
    const responseMessage = maybeError.response?.data?.message || maybeError.response?.data?.error;
    if (responseMessage) return responseMessage;
    if (maybeError.message) return maybeError.message;
  }
  return 'Unknown error';
};

const resolveRegenerateFailureMessage = async (
  facilityId: string,
  error: unknown,
): Promise<string> => {
  try {
    const stateResp = await apiService.getAccessCodePushState(facilityId);
    const lastError = stateResp?.data?.last_error;
    if (lastError && String(lastError).trim().length > 0) {
      return String(lastError);
    }
  } catch {
    // Fall back to request error details when push-state fetch fails.
  }
  return getErrorMessage(error);
};

export interface AccessCodeGroupPanelProps {
  facilityId: string;
  group: DeviceGroup;
  members: GroupMemberRef[];
  accessControlDevices: AccessControlDevice[];
  onDataChanged?: () => Promise<void> | void;
}

export function AccessCodeGroupPanel({
  facilityId,
  group,
  members,
  accessControlDevices,
  onDataChanged,
}: AccessCodeGroupPanelProps) {
  const { addToast } = useToast();
  const groupId = group.id;
  const [groupConfig, setGroupConfig] = useState<AccessCodeGroupConfig>(DEFAULT_GROUP_CONFIG);
  const [savedGroupConfig, setSavedGroupConfig] = useState<AccessCodeGroupConfig>(DEFAULT_GROUP_CONFIG);
  const [effectiveCodes, setEffectiveCodes] = useState<EffectiveAccessCode[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithTimeWindows[]>([]);
  const [scheduleUserCounts, setScheduleUserCounts] = useState<Record<string, number>>({});
  const [manualCodesBySchedule, setManualCodesBySchedule] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clockNowMs, setClockNowMs] = useState<number>(Date.now());
  const [pendingConfirm, setPendingConfirm] = useState<PendingAccessCodeConfirmation | null>(null);

  const keypadDevices = useMemo(() => filterKeypadDevices(accessControlDevices), [accessControlDevices]);
  const keypadDeviceById = useMemo(
    () => new Map(keypadDevices.map((device) => [device.id, device])),
    [keypadDevices],
  );
  const effectiveByDeviceId = useMemo(
    () => new Map(effectiveCodes.map((entry) => [entry.device_id, entry])),
    [effectiveCodes],
  );
  const selectedGroupDeviceIds = useMemo(
    () => members
      .filter((member) => (member.device_type || 'access_control') === 'access_control')
      .map((member) => member.device_id)
      .filter((deviceId) => keypadDeviceById.has(deviceId)),
    [members, keypadDeviceById],
  );
  const selectedGroupDevices = useMemo(
    () => selectedGroupDeviceIds.map((deviceId) => ({
      deviceId,
      device: keypadDeviceById.get(deviceId),
      effective: effectiveByDeviceId.get(deviceId),
    })),
    [selectedGroupDeviceIds, keypadDeviceById, effectiveByDeviceId],
  );
  const canSetupSelectedGroup = selectedGroupDevices.length > 0;
  const selectedGroupScheduleCodes = useMemo(() => {
    const scheduleMap = new Map<string, EffectiveAccessCode>();
    effectiveCodes
      .filter((entry) => entry.source_scope_type === 'device_group' && entry.source_scope_id === groupId)
      .forEach((entry) => {
        const key = entry.schedule_id || UNSCHEDULED_OPTION_ID;
        if (!scheduleMap.has(key)) {
          scheduleMap.set(key, entry);
        }
      });
    return scheduleMap;
  }, [effectiveCodes, groupId]);

  const scheduleRows = useMemo(
    () => [
      {
        id: UNSCHEDULED_OPTION_ID,
        name: 'Always-on (No Schedule)',
        userCount: null as number | null,
        current: selectedGroupScheduleCodes.get(UNSCHEDULED_OPTION_ID) || null,
      },
      ...schedules.map((schedule) => ({
        id: schedule.id,
        name: schedule.name,
        userCount: scheduleUserCounts[schedule.id] ?? 0,
        current: selectedGroupScheduleCodes.get(schedule.id) || null,
      })),
    ],
    [schedules, scheduleUserCounts, selectedGroupScheduleCodes],
  );

  const lastRotationAt = useMemo(() => {
    const latestRow = Array.from(selectedGroupScheduleCodes.values())
      .sort((a, b) => new Date(String(b.valid_from || b.valid_until)).getTime() - new Date(String(a.valid_from || a.valid_until)).getTime())[0];
    const sourceTs = latestRow?.valid_from || group.access_code_current_valid_from || null;
    if (!sourceTs) return null;
    const ts = new Date(sourceTs).getTime();
    return Number.isFinite(ts) ? ts : null;
  }, [selectedGroupScheduleCodes, group.access_code_current_valid_from]);

  const nextRotationAt = useMemo(() => {
    if (!groupConfig.is_enabled) return null;
    const intervalHours = Number(groupConfig.rotation_interval_hours);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) return null;

    const intervalMs = intervalHours * 60 * 60 * 1000;
    const now = new Date(clockNowMs);
    const anchor = new Date(now);
    anchor.setHours(Number(groupConfig.rotation_hour), Number(groupConfig.rotation_minute), 0, 0);
    let nextMs = anchor.getTime();
    if (nextMs <= clockNowMs) {
      const elapsed = clockNowMs - nextMs;
      const increments = Math.floor(elapsed / intervalMs) + 1;
      nextMs += increments * intervalMs;
    }
    return nextMs;
  }, [clockNowMs, groupConfig.is_enabled, groupConfig.rotation_hour, groupConfig.rotation_interval_hours, groupConfig.rotation_minute]);

  const timeUntilNextRotationLabel = useMemo(() => {
    if (!nextRotationAt) return groupConfig.is_enabled ? 'Calculating...' : 'Rotation disabled';
    const diffMs = Math.max(0, nextRotationAt - clockNowMs);
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }, [clockNowMs, groupConfig.is_enabled, nextRotationAt]);

  const schedulePreview = useMemo(() => {
    const hh = String(groupConfig.rotation_hour).padStart(2, '0');
    const mm = String(groupConfig.rotation_minute).padStart(2, '0');
    return `Rotation for this group runs every ${groupConfig.rotation_interval_hours} hour(s), anchored at ${hh}:${mm}.`;
  }, [groupConfig.rotation_hour, groupConfig.rotation_interval_hours, groupConfig.rotation_minute]);

  const hasPendingConfigChanges = useMemo(
    () => (
      savedGroupConfig.is_enabled !== groupConfig.is_enabled
      || Number(savedGroupConfig.digit_count) !== Number(groupConfig.digit_count)
      || Number(savedGroupConfig.rotation_interval_hours) !== Number(groupConfig.rotation_interval_hours)
      || Number(savedGroupConfig.rotation_hour) !== Number(groupConfig.rotation_hour)
      || Number(savedGroupConfig.rotation_minute) !== Number(groupConfig.rotation_minute)
    ),
    [groupConfig, savedGroupConfig],
  );

  const groupHealth = useMemo(() => {
    const withEffectiveCode = selectedGroupDevices.filter((entry) => !!entry.effective).length;
    return {
      totalDevices: selectedGroupDevices.length,
      withEffectiveCode,
    };
  }, [selectedGroupDevices]);

  const loadPanelData = async () => {
    setLoading(true);
    try {
      const [effectiveList, cfg, scheduleResponse] = await Promise.all([
        apiService.getEffectiveAccessCodes(facilityId),
        apiService.getAccessCodeGroupConfig(groupId),
        apiService.getFacilitySchedules(facilityId),
      ]);
      const loadedSchedules = (scheduleResponse?.schedules || []) as ScheduleWithTimeWindows[];
      const usageResponses = await Promise.all(
        loadedSchedules.map(async (schedule) => {
          try {
            const usage = await apiService.getScheduleUsage(facilityId, schedule.id);
            const count = Number(usage?.usage?.totalCount ?? usage?.data?.totalCount ?? 0);
            return { id: schedule.id, count: Number.isFinite(count) ? count : 0 };
          } catch {
            return { id: schedule.id, count: 0 };
          }
        }),
      );
      const usageMap = usageResponses.reduce<Record<string, number>>((acc, row) => {
        acc[row.id] = row.count;
        return acc;
      }, {});
      const nextConfig = cfg.data || DEFAULT_GROUP_CONFIG;

      setEffectiveCodes(effectiveList.data || []);
      setSchedules(loadedSchedules);
      setScheduleUserCounts(usageMap);
      setGroupConfig(nextConfig);
      setSavedGroupConfig(nextConfig);
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to load access code settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPanelData().catch(() => undefined);
  }, [facilityId, groupId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setManualCodesBySchedule((prev) => Object.keys(prev).reduce<Record<string, string>>((acc, key) => {
      acc[key] = prev[key].slice(0, Number(groupConfig.digit_count));
      return acc;
    }, {}));
  }, [groupConfig.digit_count]);

  const validateConfig = (): string | null => {
    const digitCount = Number(groupConfig.digit_count);
    const interval = Number(groupConfig.rotation_interval_hours);
    const hour = Number(groupConfig.rotation_hour);
    const minute = Number(groupConfig.rotation_minute);

    if (!Number.isInteger(digitCount) || digitCount < 3 || digitCount > 8) return 'Code length must be between 3 and 8 digits.';
    if (!Number.isFinite(interval) || interval <= 0) return 'Rotation interval must be greater than 0 hours.';
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'Rotation hour must be between 0 and 23.';
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return 'Rotation minute must be between 0 and 59.';
    if (groupConfig.is_enabled && selectedGroupDeviceIds.length === 0) {
      return 'Add at least one keypad-enabled access-control device to this group before enabling rotation.';
    }
    return null;
  };

  const notifyChanged = async () => {
    await loadPanelData();
    await onDataChanged?.();
  };

  const saveConfig = async () => {
    const validationError = validateConfig();
    if (validationError) {
      setConfigError(validationError);
      addToast({ type: 'error', title: validationError });
      return;
    }

    setConfigError(null);
    setSaving(true);
    try {
      await apiService.updateAccessCodeGroupConfig(groupId, {
        is_enabled: groupConfig.is_enabled,
        digit_count: Number(groupConfig.digit_count),
        rotation_interval_hours: Number(groupConfig.rotation_interval_hours),
        rotation_hour: Number(groupConfig.rotation_hour),
        rotation_minute: Number(groupConfig.rotation_minute),
      });
      await notifyChanged();
      addToast({ type: 'success', title: 'Group setup saved' });
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to save group setup' });
    } finally {
      setSaving(false);
    }
  };

  const executeRotateNow = async () => {
    setSaving(true);
    try {
      await apiService.rotateAccessCodes({
        facility_id: facilityId,
        scope_type: 'device_group',
        scope_id: groupId,
      });
      await notifyChanged();
      addToast({ type: 'success', title: 'Group code regenerated and pushed' });
    } catch (error) {
      console.error(error);
      const message = await resolveRegenerateFailureMessage(facilityId, error);
      addToast({
        type: 'error',
        title: 'Failed to regenerate group code',
        message,
      });
    } finally {
      setSaving(false);
    }
  };

  const executeSetManualForSchedule = async (scheduleId: string, manualCode: string) => {
    setSaving(true);
    try {
      await apiService.setManualAccessCode({
        facility_id: facilityId,
        scope_type: 'device_group',
        scope_id: groupId,
        code: manualCode,
        schedule_id: scheduleId === UNSCHEDULED_OPTION_ID ? null : scheduleId,
      });
      setManualCodesBySchedule((prev) => ({ ...prev, [scheduleId]: '' }));
      await notifyChanged();
      addToast({ type: 'success', title: 'Manual code applied and pushed' });
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to set manual code' });
    } finally {
      setSaving(false);
    }
  };

  const rotateNow = () => {
    if (hasPendingConfigChanges) {
      addToast({ type: 'error', title: 'Save pending group configuration changes before rotating codes.' });
      return;
    }
    setPendingConfirm({ type: 'rotate', groupLabel: group.name });
  };

  const setManualForSchedule = (scheduleId: string) => {
    const manualCode = (manualCodesBySchedule[scheduleId] || '').trim();
    const manualCodeValid = /^\d+$/.test(manualCode) && manualCode.length === Number(groupConfig.digit_count);
    if (!manualCodeValid) return;
    if (hasPendingConfigChanges) {
      addToast({ type: 'error', title: 'Save pending group configuration changes before setting a manual code.' });
      return;
    }
    const scheduleName = scheduleId === UNSCHEDULED_OPTION_ID
      ? 'Always-on (No Schedule)'
      : (schedules.find((schedule) => schedule.id === scheduleId)?.name || scheduleId);
    setPendingConfirm({
      type: 'manual',
      groupLabel: group.name,
      scheduleLabel: scheduleName,
      code: manualCode,
      scheduleId,
    });
  };

  const confirmPendingAction = async () => {
    const pending = pendingConfirm;
    setPendingConfirm(null);
    if (!pending) return;
    if (pending.type === 'rotate') {
      await executeRotateNow();
      return;
    }
    await executeSetManualForSchedule(pending.scheduleId, pending.code);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (!canSetupSelectedGroup) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Keypad setup unavailable</p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
          {group.name} has no keypad-enabled access-control devices. Add at least one on the Members tab before configuring codes.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className={overviewSectionClass}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Rotation settings</h5>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {groupHealth.totalDevices} keypad device{groupHealth.totalDevices === 1 ? '' : 's'} · {groupHealth.withEffectiveCode} synced · {groupConfig.digit_count}-digit codes
              </p>
            </div>
            {hasPendingConfigChanges && (
              <button
                type="button"
                onClick={saveConfig}
                disabled={saving}
                className="btn-primary"
              >
                Save changes
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className={detailsFormLabelClass}>Code length</label>
              <select
                value={groupConfig.digit_count}
                onChange={(e) => setGroupConfig((prev) => ({ ...prev, digit_count: Number(e.target.value) }))}
                className={detailsInputClass}
              >
                {[3, 4, 5, 6, 7, 8].map((value) => (
                  <option key={value} value={value}>{value} digits</option>
                ))}
              </select>
            </div>
            <div>
              <label className={detailsFormLabelClass}>Every (hours)</label>
              <input
                type="number"
                min={0.0003}
                step={0.0001}
                value={groupConfig.rotation_interval_hours}
                disabled={!groupConfig.is_enabled}
                onChange={(e) => setGroupConfig((prev) => ({ ...prev, rotation_interval_hours: Number(e.target.value) }))}
                className={`${detailsInputClass} tabular-nums disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>
            <div>
              <label className={detailsFormLabelClass}>Anchor hour</label>
              <input
                type="number"
                min={0}
                max={23}
                value={groupConfig.rotation_hour}
                disabled={!groupConfig.is_enabled}
                onChange={(e) => setGroupConfig((prev) => ({ ...prev, rotation_hour: Number(e.target.value) }))}
                className={`${detailsInputClass} tabular-nums disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>
            <div>
              <label className={detailsFormLabelClass}>Anchor minute</label>
              <input
                type="number"
                min={0}
                max={59}
                value={groupConfig.rotation_minute}
                disabled={!groupConfig.is_enabled}
                onChange={(e) => setGroupConfig((prev) => ({ ...prev, rotation_minute: Number(e.target.value) }))}
                className={`${detailsInputClass} tabular-nums disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40 dark:hover:bg-gray-800/60">
            <input
              type="checkbox"
              checked={groupConfig.is_enabled}
              onChange={(e) => setGroupConfig((prev) => ({ ...prev, is_enabled: e.target.checked }))}
              className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900 dark:text-white">Automatic rotation enabled</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{schedulePreview}</span>
            </span>
          </label>

          {configError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{configError}</p>}
          {hasPendingConfigChanges && (
            <p className={`mt-3 ${overviewAlertWarningClass} text-xs text-amber-800 dark:text-amber-200`}>
              Save configuration before rotating or setting manual codes.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={`flex min-h-[4.5rem] flex-col ${overviewStatCardClass}`}>
              <p className={overviewFieldLabelClass}>Last rotation</p>
              <p className="mt-auto pt-1 text-sm text-gray-900 dark:text-white">
                {lastRotationAt ? formatDateTime(new Date(lastRotationAt)) : 'None recorded'}
              </p>
            </div>
            <div className={`flex min-h-[4.5rem] flex-col ${overviewStatCardClass}`}>
              <p className={overviewFieldLabelClass}>Next rotation</p>
              <p className="mt-auto pt-1 text-sm text-gray-900 dark:text-white">
                {nextRotationAt ? formatDateTime(new Date(nextRotationAt)) : 'Rotation disabled'}
              </p>
            </div>
            <div className={`flex min-h-[4.5rem] flex-col ${overviewStatCardClass}`}>
              <p className={overviewFieldLabelClass}>Countdown</p>
              <p
                className={`mt-auto pt-1 text-sm text-gray-900 dark:text-white ${
                  nextRotationAt ? 'font-mono tabular-nums' : ''
                }`}
              >
                {timeUntilNextRotationLabel}
              </p>
            </div>
          </div>
        </section>

        <section className={overviewSectionClass}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Schedule codes</h5>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Current codes and manual overrides per schedule.
              </p>
            </div>
            <button
              type="button"
              onClick={rotateNow}
              disabled={saving || hasPendingConfigChanges}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-950/50"
            >
              Re-Generate Group Codes
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400 md:grid">
              <span>Schedule</span>
              <span>Users</span>
              <span>Current</span>
              <span>Manual override</span>
            </div>
            {scheduleRows.map((row, index) => {
              const currentInput = manualCodesBySchedule[row.id] || '';
              const inputValid = /^\d+$/.test(currentInput) && currentInput.length === Number(groupConfig.digit_count);
              return (
                <div
                  key={row.id}
                  className={`px-4 py-3 ${index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{row.name}</p>
                      {row.current?.valid_until && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          Valid until {formatDateTime(row.current.valid_until)}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 md:text-center">
                      {row.userCount === null ? '—' : row.userCount}
                    </p>
                    <p className="font-mono text-sm tracking-widest text-gray-900 dark:text-white md:text-center">
                      {row.current?.code || '—'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={currentInput}
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, '').slice(0, Number(groupConfig.digit_count));
                          setManualCodesBySchedule((prev) => ({ ...prev, [row.id]: value }));
                        }}
                        placeholder={`${groupConfig.digit_count} digits`}
                        className="w-full min-w-[8rem] max-w-[10rem] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                      />
                      <button
                        type="button"
                        onClick={() => setManualForSchedule(row.id)}
                        disabled={saving || !inputValid || hasPendingConfigChanges}
                        className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={overviewSectionClass}>
          <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Keypad device sync</h5>
          <p className="mt-1 mb-4 text-xs text-gray-500 dark:text-gray-400">
            Effective code state for keypad-enabled devices in this group.
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            {selectedGroupDevices.map((entry, index) => {
              const expectedGroupCodes = new Set(
                Array.from(selectedGroupScheduleCodes.values()).map((row) => row.code),
              );
              if (group.access_code_current_code) {
                expectedGroupCodes.add(group.access_code_current_code);
              }
              const outOfSyncWithGroupCode = Boolean(
                expectedGroupCodes.size > 0
                && (!entry.effective || !expectedGroupCodes.has(entry.effective.code)),
              );
              return (
                <div
                  key={entry.deviceId}
                  className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''
                  } ${outOfSyncWithGroupCode ? 'bg-amber-50/80 dark:bg-amber-950/20' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">{entry.device?.name || entry.deviceId}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        outOfSyncWithGroupCode
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      }`}
                      >
                        {outOfSyncWithGroupCode ? 'Out of sync' : 'Synced'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.device?.device_type || 'access control'}
                      {entry.device?.location_description ? ` · ${entry.device.location_description}` : ''}
                    </p>
                  </div>
                  <div className="text-left text-xs text-gray-500 dark:text-gray-400 sm:text-right">
                    {entry.effective
                      ? (
                        <>
                          <span className="font-mono tracking-wider text-gray-900 dark:text-white">{entry.effective.code}</span>
                          <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
                          <span>Until {formatDateTime(entry.effective.valid_until)}</span>
                        </>
                      )
                      : 'No effective code assigned'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingConfirm)}
        title={pendingConfirm?.type === 'rotate' ? 'Regenerate Group Codes' : 'Set Manual Access Code'}
        message={
          pendingConfirm?.type === 'rotate'
            ? `Regenerate and push new codes now for "${pendingConfirm.groupLabel}"?`
            : pendingConfirm
              ? `Set manual code ${pendingConfirm.code} for "${pendingConfirm.groupLabel}" (${pendingConfirm.scheduleLabel}) and push now?`
              : ''
        }
        confirmLabel={pendingConfirm?.type === 'rotate' ? 'Regenerate & Push' : 'Set & Push'}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => { confirmPendingAction().catch(() => undefined); }}
      />
    </>
  );
}
