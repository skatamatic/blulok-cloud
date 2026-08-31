export type DenylistDeviceType = 'blulok' | 'access_control';

export interface DenylistDeviceTarget {
  device_id: string;
  device_type: DenylistDeviceType;
}
