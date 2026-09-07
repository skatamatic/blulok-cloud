import type { DeviceDetailTabId } from './device-detail-tab.types';

export type DeviceDetailTabStorage = {
  read(): string | null;
  write(tab: DeviceDetailTabId): void;
};

export function createLocalDeviceDetailTabStorage(key = 'simulator.deviceDetailTab'): DeviceDetailTabStorage {
  return {
    read: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (tab) => {
      try {
        localStorage.setItem(key, tab);
      } catch {
        // ignore quota / private mode
      }
    },
  };
}
