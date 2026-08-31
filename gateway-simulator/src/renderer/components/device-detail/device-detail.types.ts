import type { GatewayInstanceState } from '@protocol/ipc-channels';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import type { DeviceSimulatorState, StoredAccessCode } from '@protocol/device-simulator-state';
import type { UserInstanceState } from '@protocol/user-simulator-state';

export type DeviceDetailUpdateRequest = {
  inventoryPatch?: Partial<DeviceInventoryItem>;
  simPatch?: Partial<DeviceSimulatorState>;
  denylist?: DeviceSimulatorState['denylist'];
  accessCodes?: StoredAccessCode[];
};

export type DeviceDetailSectionProps = {
  gateway: GatewayInstanceState;
  deviceKey: string;
  item: DeviceInventoryItem;
  sim: DeviceSimulatorState;
  connected: boolean;
  users: UserInstanceState[];
  onRefresh: () => void;
  applyUpdate: (req: DeviceDetailUpdateRequest) => Promise<void>;
};
