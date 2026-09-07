import type {
  AccessCodeUpdatePayload,
  DenylistAddPayload,
  DenylistRemovePayload,
  DenylistSyncPayload,
  DeviceDeletedPayload,
  JwtCommandPayload,
  LockUnlockPayload,
  RotateOperationsKeyPayload,
  SecureTimeSyncPayload,
} from '@protocol/commands';
import type { ICommandHandler, CommandContext } from '../ICommandHandler';
import { findDeviceForCommand, isLockCommandExpired } from '../lock-unlock.utils';
import { deviceKey } from '../../devices/IDeviceModel';
import {
  appendCommandLog,
  applyAccessCodesForDevice,
  applyDenylistAdd,
  applyDenylistRemove,
  applySecureTimeSync,
} from '../../devices/device-simulator.utils';
import {
  applyOperationalDenylistSync,
  findRecordKeyForOperationalSync,
} from '../../devices/denylist-sync.utils';

export class LockUnlockHandler implements ICommandHandler {
  readonly cmdType = 'LOCK_UNLOCK';

  async handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type !== 'LOCK' && payload.cmd_type !== 'UNLOCK') return;
    const command = payload as LockUnlockPayload;
    const mode = ctx.behavior.lockUnlockMode;

    ctx.onNotify?.({
      summary: `Inbound ${command.cmd_type} for device_id=${command.device_id}`,
      payload: { cmd_type: command.cmd_type, device_id: command.device_id, expires_at: command.expires_at },
    });

    if (mode === 'ignore') {
      ctx.onNotify?.({ summary: `Ignored ${command.cmd_type} (lockUnlockMode=ignore)` });
      return;
    }

    if (isLockCommandExpired(command)) {
      ctx.onNotify?.({ summary: `Ignored expired ${command.cmd_type} for device_id=${command.device_id}` });
      return;
    }

    await delay(ctx.behavior.commandLatencyMs);

    const device = findDeviceForCommand(ctx.registry.iterDevices(), command.device_id);
    if (!device) {
      ctx.onNotify?.({
        summary: `No local device matched ${command.cmd_type} device_id=${command.device_id}`,
      });
      return;
    }

    const key = deviceKey(device.toInventoryItem());
    const changed = device.applyCommand(payload);
    if (changed) {
      ctx.registry.updateSimState(key, (sim) => {
        appendCommandLog(sim, {
          cmd_type: command.cmd_type,
          summary: `Applied ${command.cmd_type}`,
          accepted: true,
        });
      });
    } else {
      ctx.registry.updateSimState(key, (sim) => {
        appendCommandLog(sim, {
          cmd_type: command.cmd_type,
          summary: `${command.cmd_type} had no effect`,
          accepted: false,
        });
      });
      ctx.onNotify?.({ summary: `${command.cmd_type} had no effect on ${device.id}` });
      return;
    }

    ctx.onPersist?.();
    ctx.onDevicesChanged?.();

    const item = device.toInventoryItem();
    if (mode === 'accept') {
      const res = await ctx.proxy.stateSync(ctx.facilityId, [device.toStateUpdate()]);
      ctx.onNotify?.({
        summary: `Applied ${command.cmd_type} → state sync HTTP ${res.status}`,
        payload: { device: item, response: res.body },
      });
      if (res.status >= 400) {
        ctx.onNotify?.({ summary: `State sync failed after ${command.cmd_type}: HTTP ${res.status}` });
      }
    } else {
      ctx.onNotify?.({
        summary: `Applied ${command.cmd_type} locally (apply-only — cloud not updated)`,
        payload: { device: item },
      });
    }
  }
}

function resolveTargetDeviceKeys(
  ctx: CommandContext,
  targetIds: string[] | undefined,
): string[] {
  if (!targetIds?.length) {
    return [...ctx.registry.iterRecords()].map(([key]) => key);
  }
  const keys = new Set<string>();
  for (const targetId of targetIds) {
    const device = findDeviceForCommand(ctx.registry.iterDevices(), targetId);
    if (device) keys.add(deviceKey(device.toInventoryItem()));
  }
  return [...keys];
}

export class DenylistHandler implements ICommandHandler {
  readonly cmdType = 'DENYLIST';

  async handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (
      payload.cmd_type !== 'DENYLIST_ADD'
      && payload.cmd_type !== 'DENYLIST_REMOVE'
      && payload.cmd_type !== 'DENYLIST_SYNC'
    ) {
      return;
    }

    await delay(ctx.behavior.commandLatencyMs);

    if (payload.cmd_type === 'DENYLIST_SYNC') {
      await this.handleSync(payload as DenylistSyncPayload, ctx);
      return;
    }

    const isAdd = payload.cmd_type === 'DENYLIST_ADD';
    const entries = isAdd
      ? (payload as DenylistAddPayload).denylist_add ?? []
      : (payload as DenylistRemovePayload).denylist_remove ?? [];
    const targetKeys = resolveTargetDeviceKeys(ctx, (payload as DenylistAddPayload).target);

    let affected = 0;
    for (const key of targetKeys) {
      const result = ctx.registry.updateSimState(key, (sim) => {
        const count = isAdd ? applyDenylistAdd(sim, entries) : applyDenylistRemove(sim, entries);
        if (count > 0 || isAdd) {
          appendCommandLog(sim, {
            cmd_type: payload.cmd_type,
            summary: isAdd ? `Added ${count} denylist entries` : `Removed ${count} denylist entries`,
            accepted: true,
          });
        }
      });
      if (result) affected += 1;
    }

    if (affected > 0) {
      ctx.onPersist?.();
      ctx.onDevicesChanged?.();
    }

    ctx.onNotify?.({
      summary: `${payload.cmd_type} applied to ${affected} device(s)`,
      payload: { entries, target: targetKeys },
    });
  }

  private async handleSync(payload: DenylistSyncPayload, ctx: CommandContext): Promise<void> {
    const rows = payload.devices ?? [];
    const applied = applyOperationalDenylistSync(
      ctx.registry,
      rows.map((row) => ({
        cloud_device_id: row.cloud_device_id,
        kind: row.kind,
        serial: row.serial,
        relay_channel: row.relay_channel,
        denylist: row.denylist ?? [],
      })),
    );

    for (const row of rows) {
      const key = findRecordKeyForOperationalSync(ctx.registry, {
        cloud_device_id: row.cloud_device_id,
        kind: row.kind,
        serial: row.serial,
        relay_channel: row.relay_channel,
        denylist: row.denylist ?? [],
      });
      if (!key) continue;
      ctx.registry.updateSimState(key, (sim) => {
        appendCommandLog(sim, {
          cmd_type: 'DENYLIST_SYNC',
          summary: `Replaced denylist (${row.denylist?.length ?? 0} entries)`,
          accepted: true,
        });
      });
    }

    if (applied > 0 || rows.length > 0) {
      ctx.onPersist?.();
      ctx.onDevicesChanged?.();
    }

    const entryCount = rows.reduce((sum, row) => sum + (row.denylist?.length ?? 0), 0);
    ctx.onNotify?.({
      summary: `DENYLIST_SYNC applied to ${applied} device(s) (${entryCount} entries)`,
      payload: { devices: rows.length, entries: entryCount },
    });
  }
}

export class AccessCodeHandler implements ICommandHandler {
  readonly cmdType = 'ACCESS_CODE_UPDATE';

  async handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type !== 'ACCESS_CODE_UPDATE') return;
    const p = payload as AccessCodeUpdatePayload;
    const mode = ctx.behavior.accessCodeAckMode;
    if (mode === 'ignore') return;

    await delay(ctx.behavior.commandLatencyMs);
    const accepted = mode === 'accept';

    if (accepted) {
      for (const codeEntry of p.codes ?? []) {
        for (const [key, record] of ctx.registry.iterRecords()) {
          const item = record.item;
          if (item.kind !== 'access_control') continue;
          const matchesAccessId = item.access_id === codeEntry.access_id
            || codeEntry.device_id === item.access_id;
          const relay = codeEntry.relay_channel ?? 1;
          if (!matchesAccessId || (item.relay_channel ?? 1) !== relay) continue;

          ctx.registry.updateSimState(key, (sim) => {
            applyAccessCodesForDevice(sim, codeEntry.valid_codes ?? [], p.nonce);
            appendCommandLog(sim, {
              cmd_type: 'ACCESS_CODE_UPDATE',
              summary: `Stored ${codeEntry.valid_codes?.length ?? 0} access code(s)`,
              accepted: true,
            });
          });
        }
      }
      ctx.onPersist?.();
      ctx.onDevicesChanged?.();
    }

    ctx.transport.send({
      type: 'ACCESS_CODE_UPDATE_ACK',
      nonce: p.nonce,
      accepted,
      message: accepted ? undefined : 'simulator-reject',
    });

    ctx.onNotify?.({
      summary: `ACCESS_CODE_UPDATE ${accepted ? 'accepted' : 'rejected'} (nonce=${p.nonce})`,
      payload: { codes: p.codes?.length ?? 0 },
    });
  }
}

export class DeviceDeletedHandler implements ICommandHandler {
  readonly cmdType = 'DEVICE_DELETED';

  async handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type !== 'DEVICE_DELETED') return;
    const p = payload as DeviceDeletedPayload;
    const mode = ctx.behavior.deviceDeletionAckMode;
    if (mode === 'hold') return;

    await delay(ctx.behavior.commandLatencyMs);
    const accepted = mode === 'accept';

    if (accepted) {
      let removed = false;
      if (p.device_kind === 'lock' && p.lock_id) {
        const device = findDeviceForCommand(ctx.registry.iterDevices(), p.lock_id);
        removed = device
          ? ctx.registry.remove(deviceKey(device.toInventoryItem()))
          : ctx.registry.remove(`lock:${p.lock_id}`);
      } else if (p.device_kind === 'access_control' && p.access_id) {
        const device = findDeviceForCommand(ctx.registry.iterDevices(), p.access_id);
        removed = device
          ? ctx.registry.remove(deviceKey(device.toInventoryItem()))
          : ctx.registry.remove(`access_control:${p.access_id}:${p.relay_channel ?? 1}`);
      } else if (p.serial) {
        for (const kind of ['bridge', 'friend_node', 'gateway'] as const) {
          if (ctx.registry.remove(`${kind}:${p.serial}`)) removed = true;
        }
      }
      if (removed) {
        ctx.onPersist?.();
        ctx.onDevicesChanged?.();
        ctx.onNotify?.({
          summary: `DEVICE_DELETED applied — removed ${p.device_kind} from local inventory`,
          payload: {
            device_kind: p.device_kind,
            lock_id: p.lock_id,
            access_id: p.access_id,
            serial: p.serial,
          },
        });
      }
    }

    ctx.transport.send({
      type: 'DEVICE_DELETED_ACK',
      nonce: p.nonce,
      success: accepted,
      accepted,
      error: accepted ? undefined : 'simulator-reject',
    });
  }
}

export class TimeSyncHandler implements ICommandHandler {
  readonly cmdType = 'SECURE_TIME_SYNC';

  async handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type !== 'SECURE_TIME_SYNC') return;
    const p = payload as SecureTimeSyncPayload;
    const ts = typeof p.ts === 'number' ? p.ts : Math.floor(Date.now() / 1000);

    await delay(ctx.behavior.commandLatencyMs);

    if (p.lock_id) {
      const device = findDeviceForCommand(ctx.registry.iterDevices(), p.lock_id);
      if (device) {
        const key = deviceKey(device.toInventoryItem());
        ctx.registry.updateSimState(key, (sim) => {
          applySecureTimeSync(sim, ts);
          appendCommandLog(sim, {
            cmd_type: 'SECURE_TIME_SYNC',
            summary: `Secure time sync ts=${ts}`,
            accepted: true,
          });
        });
      }
    } else {
      ctx.applySecureTimeSync?.(ts);
      ctx.registry.forEachSimState((key, sim) => {
        applySecureTimeSync(sim, ts);
        appendCommandLog(sim, {
          cmd_type: 'SECURE_TIME_SYNC',
          summary: `Secure time sync ts=${ts}`,
          accepted: true,
        });
      });
    }

    ctx.onPersist?.();
    ctx.onDevicesChanged?.();
    ctx.onNotify?.({ summary: `SECURE_TIME_SYNC applied (ts=${ts})`, payload: { lock_id: p.lock_id } });
  }
}

export class RotateOperationsKeyHandler implements ICommandHandler {
  readonly cmdType = 'ROTATE_OPERATIONS_KEY';

  async handle(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type !== 'ROTATE_OPERATIONS_KEY') return;
    const p = payload as RotateOperationsKeyPayload;
    if (!p.new_ops_pubkey) {
      ctx.onNotify?.({ summary: 'ROTATE_OPERATIONS_KEY missing new_ops_pubkey' });
      return;
    }

    await delay(ctx.behavior.commandLatencyMs);
    ctx.applyOperationsKeyRotation?.(p.new_ops_pubkey, p.ts ?? Math.floor(Date.now() / 1000));
    ctx.onPersist?.();
    ctx.onDevicesChanged?.();
    ctx.onNotify?.({
      summary: `ROTATE_OPERATIONS_KEY applied (ts=${p.ts ?? 'now'})`,
      payload: { new_ops_pubkey: p.new_ops_pubkey.slice(0, 16) + '…' },
    });
  }
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}
