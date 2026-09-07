import type { JwtCommandPayload } from '@protocol/commands';
import { normalizeInboundCommand } from '../crypto/JwtCodec';
import type { ICommandHandler, CommandContext } from './ICommandHandler';
import {
  AccessCodeHandler,
  DenylistHandler,
  DeviceDeletedHandler,
  LockUnlockHandler,
  RotateOperationsKeyHandler,
  TimeSyncHandler,
} from './handlers';
import { FirmwareReceiver } from '../firmware/FirmwareReceiver';
import { InventorySnapshotReceiver } from '../inventory/InventorySnapshotReceiver';

export class CommandRouter {
  private handlers: ICommandHandler[];

  constructor(
    private readonly firmware: FirmwareReceiver,
    private readonly inventory: InventorySnapshotReceiver,
    handlers?: ICommandHandler[],
  ) {
    this.handlers =
      handlers ??
      [
        new LockUnlockHandler(),
        new DenylistHandler(),
        new AccessCodeHandler(),
        new DeviceDeletedHandler(),
        new TimeSyncHandler(),
        new RotateOperationsKeyHandler(),
      ];
  }

  async route(raw: unknown, ctx: CommandContext): Promise<void> {
    const obj = raw as Record<string, unknown>;

    if (obj?.type === 'FIRMWARE_MANIFEST' || obj?.type === 'FIRMWARE_CHUNK') {
      await this.firmware.handleMessage(raw, ctx);
      return;
    }

    if (obj?.type === 'INVENTORY_SNAPSHOT_MANIFEST' || obj?.type === 'INVENTORY_SNAPSHOT_CHUNK') {
      await this.inventory.handleMessage(raw, ctx);
      return;
    }

    const payload = normalizeInboundCommand(raw);
    if (!payload?.cmd_type) return;

    if (payload.cmd_type === 'FIRMWARE_MANIFEST' || payload.cmd_type === 'FIRMWARE_CHUNK') {
      await this.firmware.handleJwtPayload(payload, ctx);
      return;
    }

    if (payload.cmd_type === 'INVENTORY_SNAPSHOT_MANIFEST' || payload.cmd_type === 'INVENTORY_SNAPSHOT_CHUNK') {
      await this.inventory.handleJwtPayload(payload, ctx);
      return;
    }

    for (const handler of this.handlers) {
      if (this.matches(handler, payload)) {
        await handler.handle(payload, ctx);
        return;
      }
    }
  }

  private matches(handler: ICommandHandler, payload: JwtCommandPayload): boolean {
    switch (handler.cmdType) {
      case 'LOCK_UNLOCK':
        return payload.cmd_type === 'LOCK' || payload.cmd_type === 'UNLOCK';
      case 'DENYLIST':
        return (
          payload.cmd_type === 'DENYLIST_ADD'
          || payload.cmd_type === 'DENYLIST_REMOVE'
          || payload.cmd_type === 'DENYLIST_SYNC'
        );
      case 'ACCESS_CODE_UPDATE':
        return payload.cmd_type === 'ACCESS_CODE_UPDATE';
      case 'DEVICE_DELETED':
        return payload.cmd_type === 'DEVICE_DELETED';
      case 'SECURE_TIME_SYNC':
        return payload.cmd_type === 'SECURE_TIME_SYNC';
      case 'ROTATE_OPERATIONS_KEY':
        return payload.cmd_type === 'ROTATE_OPERATIONS_KEY';
      default:
        return false;
    }
  }
}
