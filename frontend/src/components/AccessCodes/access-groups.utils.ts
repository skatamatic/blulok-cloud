import {
  AccessCodeGroupConfig,
  AccessControlDevice,
  DeviceGroup,
  EffectiveAccessCode,
} from '@/types/facility.types';
import { formatBluLokDevicePageTitle } from '@/utils/blulokDeviceDisplay.utils';
import { readDisplayName, readLockNumber } from '@/utils/deviceMetadataForm.utils';

export const DEFAULT_GROUP_CONFIG: AccessCodeGroupConfig = {
  is_enabled: false,
  digit_count: 6,
  rotation_interval_hours: 24,
  rotation_hour: 0,
  rotation_minute: 0,
};

export const UNSCHEDULED_OPTION_ID = '__unscheduled__';

export interface GroupMemberRef {
  device_id: string;
  device_type: 'access_control' | 'blulok';
  source_unit_id?: string | null;
}

export interface GroupableDeviceFields {
  id?: string;
  name?: string;
  device_category?: 'access_control' | 'blulok';
  device_settings?: Record<string, unknown> | null;
  device_serial?: string;
  unit_number?: string;
}

/** Same title logic as Device Details header for access-group member rows. */
export function resolveAccessGroupMemberTitle(
  member: GroupMemberRef,
  device?: GroupableDeviceFields,
): string {
  if (member.device_type === 'blulok') {
    return device ? formatBluLokDevicePageTitle(device) : 'Unknown lock';
  }
  const name = typeof device?.name === 'string' ? device.name.trim() : '';
  return name || member.device_id;
}

export function resolveGroupableDeviceLabel(device: GroupableDeviceFields): string {
  if (device.device_category === 'blulok') {
    return formatBluLokDevicePageTitle(device);
  }
  const name = typeof device.name === 'string' ? device.name.trim() : '';
  if (name) return name;
  if (device.unit_number) return `Unit ${device.unit_number}`;
  if (typeof device.device_serial === 'string' && device.device_serial.trim()) {
    return device.device_serial.trim();
  }
  return device.id || 'Unknown device';
}

export function buildGroupableBlulokSearchKeywords(device: GroupableDeviceFields): string[] {
  const title = formatBluLokDevicePageTitle(device);
  const displayName = readDisplayName(device.device_settings);
  const lockNumber = readLockNumber(device.device_settings);
  return [
    device.id,
    device.name,
    device.unit_number,
    device.device_serial,
    displayName,
    lockNumber,
    lockNumber ? `Lock #${lockNumber}` : '',
    title,
  ].filter(Boolean) as string[];
}

export function buildGroupableAccessControlSearchKeywords(
  device: GroupableDeviceFields & {
    relay_channel?: number;
    location_description?: string;
    device_type?: string;
  },
): string[] {
  return [
    device.id,
    device.name,
    device.device_serial,
    device.relay_channel != null ? `relay ${device.relay_channel}` : '',
    device.location_description,
    device.device_type,
  ].filter(Boolean) as string[];
}

export interface GroupCardSummary {
  groupId: string;
  members: GroupMemberRef[];
  config: AccessCodeGroupConfig;
  keypadDeviceCount: number;
  effectiveCodeCount: number;
  scheduleCodeCount: number;
  hasKeypadDevices: boolean;
}

export function sortAccessGroups(groups: DeviceGroup[]): DeviceGroup[] {
  return [...groups].sort((left, right) => {
    if (left.is_default !== right.is_default) {
      return left.is_default ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export function describeGroupAccess(group: DeviceGroup): string {
  if (group.is_default) {
    return 'All facility tenants — app entry and keypad access';
  }
  return 'Tenants whose unit lock is in this group — app entry and keypad access';
}

export function buildGroupSummary(
  group: DeviceGroup,
  members: GroupMemberRef[],
  config: AccessCodeGroupConfig,
  effectiveCodes: EffectiveAccessCode[],
  keypadDeviceById: Map<string, AccessControlDevice>,
): GroupCardSummary {
  const keypadMembers = members.filter(
    (member) => (member.device_type || 'access_control') === 'access_control' && keypadDeviceById.has(member.device_id),
  );
  const groupEffective = effectiveCodes.filter(
    (entry) => entry.source_scope_type === 'device_group' && entry.source_scope_id === group.id,
  );
  const effectiveDeviceIds = new Set(
    groupEffective
      .map((entry) => entry.device_id)
      .filter((deviceId) => keypadMembers.some((member) => member.device_id === deviceId)),
  );
  const scheduleIds = new Set(groupEffective.map((entry) => entry.schedule_id || UNSCHEDULED_OPTION_ID));

  return {
    groupId: group.id,
    members,
    config,
    keypadDeviceCount: keypadMembers.length,
    effectiveCodeCount: effectiveDeviceIds.size,
    scheduleCodeCount: scheduleIds.size,
    hasKeypadDevices: keypadMembers.length > 0,
  };
}

export function pushStatusClasses(status: string): string {
  if (status === 'pending') {
    return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  }
  if (status === 'error') {
    return 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300';
  }
  if (status === 'active') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  return 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

export function pushStatusLabel(status: string | undefined): string {
  if (status === 'pending' || status === 'active' || status === 'error') {
    return status;
  }
  return 'unknown';
}

export function filterKeypadDevices(devices: AccessControlDevice[]): AccessControlDevice[] {
  return devices.filter((device) => {
    const methods = device.access_methods && device.access_methods.length > 0 ? device.access_methods : ['app', 'keypad'];
    return methods.includes('keypad');
  });
}

export const FACILITY_ACCESS_GROUP_ID_PARAM = 'groupId';

export function readFacilityAccessGroupId(search: string): string | null {
  const groupId = new URLSearchParams(search).get(FACILITY_ACCESS_GROUP_ID_PARAM);
  return groupId?.trim() ? groupId : null;
}

export function buildFacilityAccessGroupsPath(facilityId: string, groupId?: string): string {
  const params = new URLSearchParams({ tab: 'device-groups' });
  if (groupId) {
    params.set(FACILITY_ACCESS_GROUP_ID_PARAM, groupId);
  }
  return `/facilities/${facilityId}?${params.toString()}`;
}
