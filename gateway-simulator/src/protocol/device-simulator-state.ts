import type { DeviceInventoryItem } from './device-kinds';
import type { AccessCodeUpdatePayload } from './commands';
import type { ScheduleTimeWindow, SerializedSchedule } from './schedule.types';

/** Persisted simulator-only state — never sent in cloud inventory sync. */
export type DenylistEntry = {
  sub: string;
  exp?: number;
  addedAt: string;
};

export type StoredAccessCode = {
  code: string;
  valid_until: string;
  valid_from?: string;
  schedule_id?: string | null;
  schedule_name?: string | null;
  schedule?: SerializedSchedule | null;
  time_windows?: ScheduleTimeWindow[];
};

export type DeviceCommandLogEntry = {
  at: string;
  cmd_type: string;
  summary: string;
  accepted: boolean;
};

export type DeviceSimulatorState = {
  facilityId: string;
  /** Provisioned device root public key (base64url) — verifies ROTATE_OPERATIONS_KEY signatures. */
  rootKeyPublicB64: string;
  /** Operations public key the device trusts for gateway commands and route passes. */
  operationsKeyPublicB64: string;
  operationsKeyRotatedAt?: string;
  lastSecureTimeSyncAt?: string;
  lastSecureTimeSyncTs?: number;
  denylist: DenylistEntry[];
  /** Access control only — keypad codes pushed via ACCESS_CODE_UPDATE. */
  accessCodes: StoredAccessCode[];
  lastAccessCodeNonce?: string;
  lastAccessCodePushAt?: string;
  errorCode?: string;
  errorMessage?: string;
  recentCommands: DeviceCommandLogEntry[];
};

export type SimulatedDeviceRecord = {
  item: DeviceInventoryItem;
  sim: DeviceSimulatorState;
};

export type DeviceDetailRecord = SimulatedDeviceRecord & {
  key: string;
};

export type UpdateDeviceSimRequest = {
  inventoryPatch?: Partial<DeviceInventoryItem>;
  simPatch?: Partial<Omit<DeviceSimulatorState, 'denylist' | 'accessCodes' | 'recentCommands'>>;
  denylist?: DenylistEntry[];
  accessCodes?: StoredAccessCode[];
};

export type AccessCodeDeviceEntry = AccessCodeUpdatePayload['codes'][number];
