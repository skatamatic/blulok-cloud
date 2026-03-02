import { useEffect, useMemo, useState } from 'react';
import { apiService } from '@/services/api.service';
import { AccessCodeGroupConfig, AccessControlDevice, DeviceGroup, EffectiveAccessCode } from '@/types/facility.types';
import { ScheduleWithTimeWindows } from '@/types/schedule.types';
import { useToast } from '@/contexts/ToastContext';
import { SearchableSelect } from '@/components/Common/SearchableSelect';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';

interface AccessCodeManagementTabProps {
  facilityId: string;
  devices: AccessControlDevice[];
}

interface GroupMember {
  device_id: string;
  device_type?: 'access_control' | 'blulok';
}

interface AccessCodePushState {
  facility_id: string;
  status: 'pending' | 'active' | 'error' | string;
  last_error: string | null;
  last_nonce: string | null;
  updated_at: string;
}

type PendingAccessCodeConfirmation =
  | { type: 'rotate'; groupLabel: string }
  | { type: 'manual'; groupLabel: string; scheduleLabel: string; code: string; scheduleId: string };

const DEFAULT_GROUP_CONFIG: AccessCodeGroupConfig = {
  is_enabled: false,
  digit_count: 6,
  rotation_interval_hours: 24,
  rotation_hour: 0,
  rotation_minute: 0,
};
const UNSCHEDULED_OPTION_ID = '__unscheduled__';

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

export function AccessCodeManagementTab({ facilityId, devices }: AccessCodeManagementTabProps) {
  const { addToast } = useToast();
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<GroupMember[]>([]);
  const [groupConfig, setGroupConfig] = useState<AccessCodeGroupConfig>(DEFAULT_GROUP_CONFIG);
  const [savedGroupConfig, setSavedGroupConfig] = useState<AccessCodeGroupConfig>(DEFAULT_GROUP_CONFIG);
  const [effectiveCodes, setEffectiveCodes] = useState<EffectiveAccessCode[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithTimeWindows[]>([]);
  const [scheduleUserCounts, setScheduleUserCounts] = useState<Record<string, number>>({});
  const [manualCodesBySchedule, setManualCodesBySchedule] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clockNowMs, setClockNowMs] = useState<number>(Date.now());
  const [pushState, setPushState] = useState<AccessCodePushState | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingAccessCodeConfirmation | null>(null);

  const keypadDevices = useMemo(
    () => devices.filter((device) => {
      const methods = device.access_methods && device.access_methods.length > 0 ? device.access_methods : ['app', 'keypad'];
      return methods.includes('keypad');
    }),
    [devices],
  );
  const keypadDeviceById = useMemo(
    () => new Map(keypadDevices.map((device) => [device.id, device])),
    [keypadDevices],
  );
  const effectiveByDeviceId = useMemo(
    () => new Map(effectiveCodes.map((entry) => [entry.device_id, entry])),
    [effectiveCodes],
  );
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const selectedGroupDeviceIds = useMemo(
    () => selectedGroupMembers
      .filter((member) => (member.device_type || 'access_control') === 'access_control')
      .map((member) => member.device_id)
      .filter((deviceId) => keypadDeviceById.has(deviceId)),
    [selectedGroupMembers, keypadDeviceById],
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
      .filter((entry) => entry.source_scope_type === 'device_group' && entry.source_scope_id === selectedGroupId)
      .forEach((entry) => {
        const key = entry.schedule_id || UNSCHEDULED_OPTION_ID;
        if (!scheduleMap.has(key)) {
          scheduleMap.set(key, entry);
        }
      });
    return scheduleMap;
  }, [effectiveCodes, selectedGroupId]);

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
    const sourceTs = latestRow?.valid_from || selectedGroup?.access_code_current_valid_from || null;
    if (!sourceTs) return null;
    const ts = new Date(sourceTs).getTime();
    return Number.isFinite(ts) ? ts : null;
  }, [selectedGroupScheduleCodes, selectedGroup?.access_code_current_valid_from]);
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
  const groupOptions = useMemo(
    () => groups.map((group) => ({
      value: group.id,
      label: group.name,
      description: 'Access-code group',
      keywords: [group.id, group.name],
    })),
    [groups],
  );
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
  const knownPushStatus = pushState?.status === 'pending'
    || pushState?.status === 'active'
    || pushState?.status === 'error';
  const pushStatusLabel = knownPushStatus ? pushState?.status : 'unknown';
  const groupHealth = useMemo(() => {
    const withEffectiveCode = selectedGroupDevices.filter((entry) => !!entry.effective).length;
    return {
      totalDevices: selectedGroupDevices.length,
      withEffectiveCode,
      missingEffectiveCode: selectedGroupDevices.length - withEffectiveCode,
    };
  }, [selectedGroupDevices]);

  const loadSelectedGroup = async (groupId: string) => {
    if (!groupId) {
      setSelectedGroupMembers([]);
      setGroupConfig(DEFAULT_GROUP_CONFIG);
      setSavedGroupConfig(DEFAULT_GROUP_CONFIG);
      return;
    }

    const [groupDetails, cfg] = await Promise.all([
      apiService.getDeviceGroup(groupId),
      apiService.getAccessCodeGroupConfig(groupId),
    ]);
    const nextConfig = cfg.data || DEFAULT_GROUP_CONFIG;
    setSelectedGroupMembers((groupDetails.data?.members || []) as GroupMember[]);
    setGroupConfig(nextConfig);
    setSavedGroupConfig(nextConfig);
  };

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [effectiveList, groupList, pushStateResp] = await Promise.all([
        apiService.getEffectiveAccessCodes(facilityId),
        apiService.getDeviceGroups(facilityId, 'access_code'),
        apiService.getAccessCodePushState(facilityId),
      ]);
      const scheduleResponse = await apiService.getFacilitySchedules(facilityId);
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
      const loadedGroups = groupList.data || [];
      const nextSelectedGroupId = loadedGroups.some((group) => group.id === selectedGroupId)
        ? selectedGroupId
        : '';

      setEffectiveCodes(effectiveList.data || []);
      setGroups(loadedGroups);
      setSchedules(loadedSchedules);
      setScheduleUserCounts(usageMap);
      setPushState(pushStateResp.data || null);
      setSelectedGroupId(nextSelectedGroupId);
      await loadSelectedGroup(nextSelectedGroupId);
    } catch (error) {
      console.error(error);
      setLoadError('Failed to load access code settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [facilityId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const stateResp = await apiService.getAccessCodePushState(facilityId);
        setPushState(stateResp.data || null);
      } catch {
        // Keep existing state on transient polling errors.
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [facilityId]);

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

    if (!selectedGroupId) return 'Select an access-code group first.';
    if (!Number.isInteger(digitCount) || digitCount < 3 || digitCount > 8) return 'Code length must be between 3 and 8 digits.';
    if (!Number.isFinite(interval) || interval <= 0) return 'Rotation interval must be greater than 0 hours.';
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'Rotation hour must be between 0 and 23.';
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return 'Rotation minute must be between 0 and 59.';
    if (groupConfig.is_enabled && selectedGroupDeviceIds.length === 0) {
      return 'Add at least one keypad-enabled access-control device to this group before enabling rotation.';
    }
    return null;
  };

  const saveConfig = async () => {
    const validationError = validateConfig();
    if (validationError) {
      setConfigError(validationError);
      addToast({ type: 'error', title: validationError });
      return;
    }

    if (!selectedGroupId) return;
    setConfigError(null);
    setSaving(true);
    try {
      await apiService.updateAccessCodeGroupConfig(selectedGroupId, {
        is_enabled: groupConfig.is_enabled,
        digit_count: Number(groupConfig.digit_count),
        rotation_interval_hours: Number(groupConfig.rotation_interval_hours),
        rotation_hour: Number(groupConfig.rotation_hour),
        rotation_minute: Number(groupConfig.rotation_minute),
      });
      await loadSelectedGroup(selectedGroupId);
      addToast({ type: 'success', title: 'Group setup saved' });
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to save group setup' });
    } finally {
      setSaving(false);
    }
  };

  const rotateNow = async () => {
    if (!selectedGroupId) {
      addToast({ type: 'error', title: 'Select an access-code group first.' });
      return;
    }
    if (hasPendingConfigChanges) {
      addToast({ type: 'error', title: 'Save pending group configuration changes before rotating codes.' });
      return;
    }
    setPendingConfirm({
      type: 'rotate',
      groupLabel: selectedGroup?.name || selectedGroupId,
    });
  };

  const executeRotateNow = async () => {
    setSaving(true);
    try {
      await apiService.rotateAccessCodes({
        facility_id: facilityId,
        scope_type: 'device_group',
        scope_id: selectedGroupId,
      });
      await load();
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

  const setManualForSchedule = async (scheduleId: string) => {
    if (!selectedGroupId) return;
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
      groupLabel: selectedGroup?.name || selectedGroupId,
      scheduleLabel: scheduleName,
      code: manualCode,
      scheduleId,
    });
  };

  const executeSetManualForSchedule = async (
    scheduleId: string,
    manualCode: string,
  ) => {
    setSaving(true);
    try {
      await apiService.setManualAccessCode({
        facility_id: facilityId,
        scope_type: 'device_group',
        scope_id: selectedGroupId,
        code: manualCode,
        schedule_id: scheduleId === UNSCHEDULED_OPTION_ID ? null : scheduleId,
      });
      setManualCodesBySchedule((prev) => ({ ...prev, [scheduleId]: '' }));
      await load();
      addToast({ type: 'success', title: 'Manual code applied and pushed' });
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to set manual code' });
    } finally {
      setSaving(false);
    }
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
    return <div className="py-6 text-sm text-gray-500 dark:text-gray-400">Loading access-code groups...</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
        <button
          type="button"
          onClick={() => load().catch(() => undefined)}
          className="mt-2 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Access-Code Group Setup</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Choose one access-code group. Everything below is now scoped to that group only.
        </p>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Group</label>
          <SearchableSelect
            value={selectedGroupId}
            onChange={(groupId) => {
              setSelectedGroupId(groupId);
              loadSelectedGroup(groupId).catch(() => undefined);
            }}
            options={groupOptions}
            placeholder="Select access-code group..."
            emptyMessage="No access-code groups found"
            className="w-full"
          />
        </div>
        {!selectedGroupId && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Create an access-code group in Device Groups first, then select it here.
          </p>
        )}
      </div>

      {selectedGroupId && (
        <>
          {!canSetupSelectedGroup ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 shadow-sm">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This group cannot be setup because it has no access control devices in it, add at least one device to configure it
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedGroup?.name || selectedGroupId}</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Current group workspace</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`rounded-full px-3 py-1 border ${
                      pushStatusLabel === 'pending'
                        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                        : pushStatusLabel === 'error'
                          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
                          : pushStatusLabel === 'active'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      Push state: {pushStatusLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white dark:bg-gray-800 px-3 py-1 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                      Devices: {groupHealth.totalDevices}
                    </span>
                    <span className="rounded-full bg-white dark:bg-gray-800 px-3 py-1 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                      Effective: {groupHealth.withEffectiveCode}
                    </span>
                    <span className="rounded-full bg-white dark:bg-gray-800 px-3 py-1 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                      Missing: {groupHealth.missingEffectiveCode}
                    </span>
                    <span className="rounded-full bg-white dark:bg-gray-800 px-3 py-1 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                      Digit count: {groupConfig.digit_count}
                    </span>
                  </div>
                </div>
                {pushState?.status === 'error' && pushState.last_error && (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                    Latest push error: {pushState.last_error}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">Group Access Code Setup</h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  All editable settings and actions for this group in one place.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Digit count (3-8)</label>
                <select
                  value={groupConfig.digit_count}
                  onChange={(e) => setGroupConfig((prev) => ({ ...prev, digit_count: Number(e.target.value) }))}
                  className="w-full max-w-[14rem] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                  <option value={7}>7</option>
                  <option value={8}>8</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used for manual entry and all scheduled/regenerated codes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2 lg:col-span-1">
                  <input
                    type="checkbox"
                    checked={groupConfig.is_enabled}
                    onChange={(e) => setGroupConfig((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                  />
                  Automatic rotation enabled
                </label>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rotate every (hours)</label>
                  <input
                    type="number"
                    min={0.0003}
                    step={0.0001}
                    value={groupConfig.rotation_interval_hours}
                    onChange={(e) => setGroupConfig((prev) => ({ ...prev, rotation_interval_hours: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Anchor hour (0-23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={groupConfig.rotation_hour}
                    onChange={(e) => setGroupConfig((prev) => ({ ...prev, rotation_hour: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Anchor minute (0-59)</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={groupConfig.rotation_minute}
                    onChange={(e) => setGroupConfig((prev) => ({ ...prev, rotation_minute: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">{schedulePreview}</p>
              {configError && <p className="text-xs text-red-600 dark:text-red-400">{configError}</p>}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Last rotation</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {lastRotationAt ? new Date(lastRotationAt).toLocaleString() : 'No group rotation recorded'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Next rotation</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {nextRotationAt ? new Date(nextRotationAt).toLocaleString() : 'Rotation disabled'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Time until next</p>
                  <p className="font-mono text-sm text-gray-900 dark:text-white">{timeUntilNextRotationLabel}</p>
                </div>
              </div>
              {hasPendingConfigChanges && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  You have unsaved configuration changes. Save before updating codes.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {hasPendingConfigChanges && (
                  <button
                    type="button"
                    onClick={saveConfig}
                    disabled={saving}
                    className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Save Group Setup
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Current and manual override per schedule (includes assigned user count).
                </p>
                {scheduleRows.map((row) => {
                  const currentInput = manualCodesBySchedule[row.id] || '';
                  const inputValid = /^\d+$/.test(currentInput) && currentInput.length === Number(groupConfig.digit_count);
                  return (
                    <div key={row.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{row.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Users: {row.userCount === null ? 'N/A' : row.userCount}
                            {row.current?.valid_until ? ` • Valid until ${new Date(row.current.valid_until).toLocaleString()}` : ''}
                          </p>
                        </div>
                        <span className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 font-mono tracking-widest text-sm text-gray-900 dark:text-white">
                          {row.current?.code || 'Not set'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={currentInput}
                          onChange={(event) => {
                            const value = event.target.value.replace(/\D/g, '').slice(0, Number(groupConfig.digit_count));
                            setManualCodesBySchedule((prev) => ({ ...prev, [row.id]: value }));
                          }}
                          placeholder={`${groupConfig.digit_count} digits`}
                          className="w-40 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setManualForSchedule(row.id)}
                          disabled={saving || !inputValid || hasPendingConfigChanges}
                          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          Set
                        </button>
                        {!inputValid && currentInput.length > 0 && (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            Must be exactly {groupConfig.digit_count} digits.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={rotateNow}
                  disabled={saving || hasPendingConfigChanges}
                  className="rounded-lg border border-primary-200 px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 disabled:opacity-50"
                >
                  Re-Generate Group Codes
                </button>
              </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Devices in This Group</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Group members with their current effective code state.
                    </p>
                  </div>
                </div>
                {hasPendingConfigChanges && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Save pending configuration changes before regenerating or pushing codes.
                  </p>
                )}
                {selectedGroupDevices.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No keypad-enabled access-control devices in this group.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedGroupDevices.map((entry) => {
                      const expectedGroupCodes = new Set(
                        Array.from(selectedGroupScheduleCodes.values()).map((row) => row.code),
                      );
                      if (selectedGroup?.access_code_current_code) {
                        expectedGroupCodes.add(selectedGroup.access_code_current_code);
                      }
                      const outOfSyncWithGroupCode = Boolean(
                        expectedGroupCodes.size > 0
                        && (
                          !entry.effective
                          || !expectedGroupCodes.has(entry.effective.code)
                        )
                      );
                      return (
                      <div
                        key={entry.deviceId}
                        className={`flex flex-col gap-2 rounded-lg px-4 py-3 text-sm md:flex-row md:items-center md:justify-between ${
                          outOfSyncWithGroupCode
                            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50'
                            : 'bg-gray-50 dark:bg-gray-800'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{entry.device?.name || entry.deviceId}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {entry.device?.device_type || 'access control'}
                            {entry.device?.location_description ? ` • ${entry.device.location_description}` : ''}
                          </p>
                          {outOfSyncWithGroupCode && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              This lock is not using the current group code.
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {entry.effective ? (
                            <>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Source: {entry.effective.source_scope_name} • Valid until {new Date(entry.effective.valid_until).toLocaleString()}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400">No effective code currently assigned</p>
                          )}
                        </div>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            </>
          )}

        </>
      )}
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

