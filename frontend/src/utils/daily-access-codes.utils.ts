import { UserAccessCode } from '@/types/facility.types';
import { formatDateTime, parseInstant } from '@/utils/datetime.utils';

export const ACCESS_DEVICE_TYPE_ORDER: UserAccessCode['device_type'][] = [
  'door',
  'gate',
  'elevator',
];

export const ACCESS_DEVICE_TYPE_LABELS: Record<UserAccessCode['device_type'], string> = {
  door: 'Doors',
  gate: 'Gates',
  elevator: 'Elevators',
};

export interface DailyAccessCodeScheduleRow {
  scheduleId: string | null;
  scheduleName: string;
  code: string;
  validUntil: string;
}

export interface DailyAccessCodeDeviceGroup {
  deviceId: string;
  deviceName: string;
  facilityId?: string;
  facilityName?: string;
  schedules: DailyAccessCodeScheduleRow[];
}

export interface DailyAccessCodeTypeGroup {
  deviceType: UserAccessCode['device_type'];
  label: string;
  devices: DailyAccessCodeDeviceGroup[];
}

export interface DailyAccessCodeEntry extends UserAccessCode {
  facility_id?: string;
  facility_name?: string;
}

function scheduleSortKey(name: string | null | undefined): [number, string] {
  const normalized = (name || 'Always-on').trim().toLowerCase();
  if (normalized === 'always-on' || normalized === 'always on') {
    return [0, normalized];
  }
  return [1, normalized];
}

function compareSchedules(a: DailyAccessCodeScheduleRow, b: DailyAccessCodeScheduleRow): number {
  const [aRank, aName] = scheduleSortKey(a.scheduleName);
  const [bRank, bName] = scheduleSortKey(b.scheduleName);
  if (aRank !== bRank) return aRank - bRank;
  return aName.localeCompare(bName);
}

function compareDevices(a: DailyAccessCodeDeviceGroup, b: DailyAccessCodeDeviceGroup): number {
  const byFacility = (a.facilityName || '').localeCompare(b.facilityName || '');
  if (byFacility !== 0) return byFacility;
  return a.deviceName.localeCompare(b.deviceName);
}

export function groupDailyAccessCodes(
  entries: DailyAccessCodeEntry[],
): DailyAccessCodeTypeGroup[] {
  const typeMap = new Map<UserAccessCode['device_type'], Map<string, DailyAccessCodeDeviceGroup>>();

  for (const entry of entries) {
    const deviceKey = `${entry.facility_id || 'scope'}:${entry.device_id}`;
    let devicesForType = typeMap.get(entry.device_type);
    if (!devicesForType) {
      devicesForType = new Map();
      typeMap.set(entry.device_type, devicesForType);
    }

    let deviceGroup = devicesForType.get(deviceKey);
    if (!deviceGroup) {
      deviceGroup = {
        deviceId: entry.device_id,
        deviceName: entry.device_name,
        facilityId: entry.facility_id,
        facilityName: entry.facility_name,
        schedules: [],
      };
      devicesForType.set(deviceKey, deviceGroup);
    }

    deviceGroup.schedules.push({
      scheduleId: entry.schedule_id ?? null,
      scheduleName: entry.schedule_name || 'Always-on',
      code: entry.code,
      validUntil: entry.valid_until,
    });
  }

  return ACCESS_DEVICE_TYPE_ORDER.filter((deviceType) => typeMap.has(deviceType)).map(
    (deviceType) => {
      const devices = Array.from(typeMap.get(deviceType)!.values())
        .map((device) => ({
          ...device,
          schedules: [...device.schedules].sort(compareSchedules),
        }))
        .sort(compareDevices);

      return {
        deviceType,
        label: ACCESS_DEVICE_TYPE_LABELS[deviceType],
        devices,
      };
    },
  );
}

export function limitDailyAccessCodeGroups(
  groups: DailyAccessCodeTypeGroup[],
  maxScheduleRows: number,
): { groups: DailyAccessCodeTypeGroup[]; hiddenCount: number } {
  if (maxScheduleRows <= 0) {
    const total = groups.reduce(
      (sum, group) =>
        sum + group.devices.reduce((deviceSum, device) => deviceSum + device.schedules.length, 0),
      0,
    );
    return { groups: [], hiddenCount: total };
  }

  let remaining = maxScheduleRows;
  let hiddenCount = 0;
  const limited: DailyAccessCodeTypeGroup[] = [];

  for (const group of groups) {
    const limitedDevices: DailyAccessCodeDeviceGroup[] = [];

    for (const device of group.devices) {
      if (remaining <= 0) {
        hiddenCount += device.schedules.length;
        continue;
      }

      if (device.schedules.length <= remaining) {
        limitedDevices.push(device);
        remaining -= device.schedules.length;
        continue;
      }

      limitedDevices.push({
        ...device,
        schedules: device.schedules.slice(0, remaining),
      });
      hiddenCount += device.schedules.length - remaining;
      remaining = 0;
    }

    if (limitedDevices.length > 0) {
      limited.push({ ...group, devices: limitedDevices });
    }
  }

  return { groups: limited, hiddenCount };
}

export function formatAccessCodeExpiry(iso: string): string {
  const date = parseInstant(iso);
  if (!date) return '—';
  return formatDateTime(date);
}

export function sharedValidUntil(schedules: DailyAccessCodeScheduleRow[]): string | null {
  if (schedules.length === 0) return null;
  const first = schedules[0].validUntil;
  return schedules.every((row) => row.validUntil === first) ? first : null;
}
