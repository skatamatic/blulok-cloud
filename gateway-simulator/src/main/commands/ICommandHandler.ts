import type { JwtCommandPayload } from '@protocol/commands';
import type { BehaviorConfig } from '@protocol/ipc-channels';
import type { DeviceRegistry } from '../devices/DeviceRegistry';
import type { ITransport } from '../net/ITransport';
import type { ProxyClient } from '../net/ProxyClient';
import type { CommandNotifyEvent } from './command-context.types';

export type CommandContext = {
  transport: ITransport;
  proxy: ProxyClient;
  registry: DeviceRegistry;
  behavior: BehaviorConfig;
  facilityId: string;
  onPersist?: () => void;
  /** Log to gateway event console and refresh UI when device inventory changes. */
  onNotify?: (event: CommandNotifyEvent) => void;
  onDevicesChanged?: () => void;
  /** When false, skip operational cloud sync (e.g. swap candidate before promotion). */
  canOperationalSync?: () => boolean;
  /** Apply OTA to the simulator gateway itself (not an inventory row). */
  applyGatewayFirmware?: (version: string) => void;
  applyOperationsKeyRotation?: (newOpsPublicB64: string, ts: number) => void;
  applySecureTimeSync?: (ts: number) => void;
  /** After recovery snapshot is applied — pull fresh cloud denylist once recovery unblocks. */
  onAfterInventorySnapshotApplied?: () => Promise<void>;
};

export interface ICommandHandler {
  readonly cmdType: string;
  handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void>;
}
