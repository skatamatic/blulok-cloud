import { apiService } from '@/services/api.service';
import {
  formatAccessGroupLabel,
  isDeviceGroupMember,
  sortAccessGroupRefs,
  type UnitAccessGroupRef,
} from '@/utils/device-group-membership.utils';

interface DeviceGroupListItem {
  id: string;
  name: string;
  is_default?: boolean;
}

interface DeviceGroupDetail {
  id: string;
  name: string;
  is_default?: boolean;
  members?: Array<{
    device_id: string;
    device_type?: 'access_control' | 'blulok';
    source_unit_id?: string | null;
  }>;
}

/**
 * Resolve access group membership for a BluLok lock using the same rules as device details.
 */
export async function loadAccessGroupRefsForBlulokLock(
  facilityId: string,
  deviceId: string,
  unitId: string,
): Promise<UnitAccessGroupRef[]> {
  const groupsResponse = await apiService.getDeviceGroups(facilityId);
  const groups: DeviceGroupListItem[] = groupsResponse.data || [];
  if (groups.length === 0) {
    return [];
  }

  const details = await Promise.all(groups.map((group) => apiService.getDeviceGroup(group.id)));
  const refs: UnitAccessGroupRef[] = [];

  for (const detail of details) {
    const group = detail.data as DeviceGroupDetail;
    const members = group.members || [];
    const isMember = members.some((member) => isDeviceGroupMember(member, deviceId, unitId, 'blulok'));
    if (isMember) {
      refs.push({
        id: group.id,
        name: group.name,
        is_default: group.is_default,
      });
    }
  }

  return sortAccessGroupRefs(refs);
}

export async function loadAccessGroupLabelsForBlulokLock(
  facilityId: string,
  deviceId: string,
  unitId: string,
): Promise<string[]> {
  const refs = await loadAccessGroupRefsForBlulokLock(facilityId, deviceId, unitId);
  return refs.map((group) => formatAccessGroupLabel(group));
}

async function loadAccessGroupRefsForDeviceCategory(
  facilityId: string,
  deviceId: string,
  deviceCategory: 'blulok' | 'access_control',
  unitId?: string | null,
): Promise<UnitAccessGroupRef[]> {
  const groupsResponse = await apiService.getDeviceGroups(facilityId);
  const groups: DeviceGroupListItem[] = groupsResponse.data || [];
  if (groups.length === 0) {
    return [];
  }

  const details = await Promise.all(groups.map((group) => apiService.getDeviceGroup(group.id)));
  const refs: UnitAccessGroupRef[] = [];

  for (const detail of details) {
    const group = detail.data as DeviceGroupDetail;
    const members = group.members || [];
    const isMember = members.some((member) =>
      isDeviceGroupMember(member, deviceId, unitId, deviceCategory),
    );
    if (isMember) {
      refs.push({
        id: group.id,
        name: group.name,
        is_default: group.is_default,
      });
    }
  }

  return sortAccessGroupRefs(refs);
}

export async function loadAccessGroupRefsForDevice(
  facilityId: string,
  deviceId: string,
  deviceCategory: 'blulok' | 'access_control',
  unitId?: string | null,
): Promise<UnitAccessGroupRef[]> {
  if (deviceCategory === 'blulok') {
    if (!unitId) {
      return [];
    }
    return loadAccessGroupRefsForBlulokLock(facilityId, deviceId, unitId);
  }

  return loadAccessGroupRefsForDeviceCategory(facilityId, deviceId, deviceCategory, unitId);
}
