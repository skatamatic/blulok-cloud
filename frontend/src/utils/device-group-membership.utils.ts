export interface UnitAccessGroupRef {
  id: string;
  name: string;
  is_default?: boolean;
}

export interface DeviceGroupMemberRef {
  device_id: string;
  device_type?: 'access_control' | 'blulok';
  source_unit_id?: string | null;
}

export function formatAccessGroupLabel(group: { name: string; is_default?: boolean }): string {
  return group.is_default ? `${group.name} (Default — all tenants)` : group.name;
}

export function isBlulokMemberForUnit(
  member: DeviceGroupMemberRef,
  unitId: string,
  deviceId?: string | null,
): boolean {
  if ((member.device_type || 'access_control') !== 'blulok') {
    return false;
  }
  if (member.source_unit_id && member.source_unit_id === unitId) {
    return true;
  }
  return Boolean(deviceId && member.device_id === deviceId);
}

export function isDeviceGroupMember(
  member: DeviceGroupMemberRef,
  deviceId: string,
  unitId?: string | null,
  deviceType: 'access_control' | 'blulok' = 'access_control',
): boolean {
  if (member.device_id === deviceId) {
    return true;
  }
  if (deviceType === 'blulok' && unitId) {
    return isBlulokMemberForUnit(member, unitId, deviceId);
  }
  return false;
}

export function sortAccessGroupRefs<T extends { name: string; is_default?: boolean }>(groups: T[]): T[] {
  return [...groups].sort((left, right) => {
    if (Boolean(left.is_default) !== Boolean(right.is_default)) {
      return left.is_default ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}
