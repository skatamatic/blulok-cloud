import {
  AccessCodeGroupConfig,
  AccessControlDevice,
  DeviceGroup,
  EffectiveAccessCode,
} from '@/types/facility.types';
import { UserRole } from '@/types/auth.types';
import { formatBluLokDevicePageTitle, formatBluLokUserFacingLabel } from '@/utils/blulokDeviceDisplay.utils';
import { readDisplayName } from '@/utils/deviceMetadataForm.utils';

export const DEFAULT_GROUP_CONFIG: AccessCodeGroupConfig = {
  is_enabled: false,
  digit_count: 6,
  rotation_interval_hours: 24,
  rotation_hour: 0,
  rotation_minute: 0,
};

export const UNSCHEDULED_OPTION_ID = '__unscheduled__';

/** Caps long member/user lists in the access groups workspace without stretching the host page. */
export const ACCESS_GROUP_LIST_SCROLL_CLASS =
  'status-area-scrollbar max-h-[min(32rem,calc(100vh-20rem))] overflow-y-auto overscroll-contain';

export interface GroupMemberRef {
  device_id: string;
  device_type: 'access_control' | 'blulok';
  source_unit_id?: string | null;
}

export type GroupUserAccessReason =
  | 'primary_tenant'
  | 'assigned_tenant'
  | 'shared_key';

export interface GroupUserAccess {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: UserRole;
  access_reasons: GroupUserAccessReason[];
  unit_numbers: string[];
}

export interface GroupableDeviceFields {
  id?: string;
  name?: string;
  device_category?: 'access_control' | 'blulok';
  device_type?: AccessControlDevice['device_type'] | string;
  location_description?: string;
  device_settings?: Record<string, unknown> | null;
  device_serial?: string;
  unit_id?: string;
  unit_number?: string;
}

export interface GroupableUnitFields {
  id: string;
  unit_number: string;
  status?: string;
  unit_type?: string;
  blulok_device?: {
    id: string;
    device_serial?: string;
    serial?: string;
  } | null;
}

export function formatUnitLabel(unitNumber: string): string {
  const trimmed = unitNumber.trim();
  return trimmed ? `Unit ${trimmed}` : 'Unit';
}

/** Stable key for member list rows and expansion state. */
export function resolveGroupMemberKey(member: GroupMemberRef): string {
  if (member.device_type === 'blulok' && member.source_unit_id) {
    return `unit:${member.source_unit_id}`;
  }
  return `${member.device_type}:${member.device_id}`;
}

export function resolveUnitForMember(
  member: GroupMemberRef,
  units: GroupableUnitFields[],
): GroupableUnitFields | undefined {
  const unitId = member.source_unit_id
    || (member.device_type === 'blulok' ? member.device_id : undefined);
  if (!unitId) return undefined;
  return units.find((unit) => unit.id === unitId);
}

export function resolveLockDeviceForUnitMember(
  member: GroupMemberRef,
  devices: GroupableDeviceFields[],
  unit?: GroupableUnitFields,
): GroupableDeviceFields | undefined {
  const unitId = member.source_unit_id || unit?.id;
  if (unitId) {
    const byUnit = devices.find(
      (device) => device.device_category === 'blulok' && device.unit_id === unitId,
    );
    if (byUnit) return byUnit;
  }
  const byId = devices.find((device) => device.id === member.device_id);
  if (byId?.device_category === 'blulok') return byId;
  return undefined;
}

export function unitMemberHasAssignedLock(
  member: GroupMemberRef,
  devices: GroupableDeviceFields[],
  unit?: GroupableUnitFields,
): boolean {
  return Boolean(resolveLockDeviceForUnitMember(member, devices, unit));
}

export function groupableUnitHasAssignedLock(
  unit: GroupableUnitFields,
  devices: GroupableDeviceFields[] = [],
): boolean {
  if (unit.blulok_device?.id) return true;
  return devices.some(
    (device) => device.device_category === 'blulok' && device.unit_id === unit.id,
  );
}

export function filterBlulokMembersByLockAssignment(
  members: GroupMemberRef[],
  includeUnitsWithoutLock: boolean,
  units: GroupableUnitFields[],
  devices: GroupableDeviceFields[],
): GroupMemberRef[] {
  if (includeUnitsWithoutLock) return members;
  return members.filter((member) => {
    if (member.device_type !== 'blulok') return true;
    const unit = resolveUnitForMember(member, units);
    return unitMemberHasAssignedLock(member, devices, unit);
  });
}

export function filterGroupableUnitsByLockAssignment(
  units: GroupableUnitFields[],
  includeUnitsWithoutLock: boolean,
  devices: GroupableDeviceFields[],
): GroupableUnitFields[] {
  if (includeUnitsWithoutLock) return units;
  return units.filter((unit) => groupableUnitHasAssignedLock(unit, devices));
}

/** Primary card title — unit-centric for BluLok members. */
export function resolveAccessGroupMemberTitle(
  member: GroupMemberRef,
  device?: GroupableDeviceFields,
  unit?: GroupableUnitFields,
): string {
  if (member.device_type === 'blulok') {
    if (unit?.unit_number) {
      return formatUnitLabel(unit.unit_number);
    }
    if (device?.unit_number) {
      return formatUnitLabel(device.unit_number);
    }
    if (member.source_unit_id) {
      return 'Unit';
    }
    return device ? formatBluLokUserFacingLabel(device) : 'Unknown unit';
  }
  const name = typeof device?.name === 'string' ? device.name.trim() : '';
  return name || member.device_id;
}

/** Secondary line under the member title. */
export function resolveAccessGroupMemberSubtitle(
  member: GroupMemberRef,
  device?: GroupableDeviceFields,
  unit?: GroupableUnitFields,
): string {
  if (member.device_type === 'blulok') {
    const lockDevice = device?.device_category === 'blulok' ? device : undefined;
    const lockFromUnit = unit?.blulok_device;
    const serial = lockDevice?.device_serial
      || lockFromUnit?.device_serial
      || lockFromUnit?.serial;
    if (serial) {
      return `Lock assigned · ${serial}`;
    }
    return 'No lock assigned';
  }
  const parts = ['Access control'];
  if (device?.device_type) parts.push(device.device_type);
  if (device?.location_description) parts.push(device.location_description);
  if (device?.device_serial) parts.push(device.device_serial);
  return parts.join(' · ');
}

export function resolveGroupableUnitLabel(unit: GroupableUnitFields): string {
  return formatUnitLabel(unit.unit_number);
}

export function buildGroupableUnitSearchKeywords(unit: GroupableUnitFields): string[] {
  const lockSerial = unit.blulok_device?.device_serial || unit.blulok_device?.serial;
  return [
    unit.id,
    unit.unit_number,
    formatUnitLabel(unit.unit_number),
    unit.status,
    unit.unit_type,
    lockSerial,
    lockSerial ? `Serial ${lockSerial}` : 'no lock',
    lockSerial ? '' : 'unassigned',
  ].filter(Boolean) as string[];
}

export function resolveGroupableDeviceLabel(device: GroupableDeviceFields): string {
  if (device.device_category === 'blulok') {
    return formatBluLokUserFacingLabel(device);
  }
  const name = typeof device.name === 'string' ? device.name.trim() : '';
  if (name) return name;
  if (device.unit_number) return formatUnitLabel(device.unit_number);
  if (typeof device.device_serial === 'string' && device.device_serial.trim()) {
    return device.device_serial.trim();
  }
  return device.id || 'Unknown device';
}

export function buildGroupableBlulokSearchKeywords(device: GroupableDeviceFields): string[] {
  const title = formatBluLokDevicePageTitle(device);
  const displayName = readDisplayName(device.device_settings);
  const identity = formatBluLokUserFacingLabel(device);
  return [
    device.id,
    device.name,
    device.unit_number,
    device.device_serial,
    displayName,
    identity,
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
  return 'Tenants whose unit is in this group — app entry and keypad access';
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
