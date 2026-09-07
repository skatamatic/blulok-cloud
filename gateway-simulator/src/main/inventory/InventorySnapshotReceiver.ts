import { createHash } from 'crypto';

import type {
  InventorySnapshotChunkPayload,
  InventorySnapshotManifestPayload,
  JwtCommandPayload,
} from '@protocol/commands';

import { decodeJwtPayload } from '../crypto/JwtCodec';
import { applyInventorySnapshotBinary } from './inventory-snapshot-applier';
import { verifyInventorySnapshotChunk } from './inventory-snapshot-chunk.utils';
import { buildDenylistByKeyFromSnapshot, countDenylistEntriesInMap } from '../devices/denylist-sync.utils';

import type { CommandContext } from '../commands/ICommandHandler';

type ActivePush = {
  manifest: InventorySnapshotManifestPayload;
  receivedChunks: Set<number>;
  chunkData: Map<number, Buffer>;
};

export class InventorySnapshotReceiver {
  private active: ActivePush | null = null;

  isBusy(): boolean {
    return this.active != null;
  }

  async handleMessage(raw: unknown, ctx: CommandContext): Promise<void> {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.jwt !== 'string') return;
    const payload = decodeJwtPayload(obj.jwt);
    await this.handleJwtPayload(payload, ctx);
  }

  async handleJwtPayload(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type === 'INVENTORY_SNAPSHOT_MANIFEST') {
      await this.onManifest(payload as InventorySnapshotManifestPayload, ctx);
    } else if (payload.cmd_type === 'INVENTORY_SNAPSHOT_CHUNK') {
      await this.onChunk(payload as InventorySnapshotChunkPayload, ctx);
    }
  }

  private async onManifest(manifest: InventorySnapshotManifestPayload, ctx: CommandContext): Promise<void> {
    this.active = {
      manifest,
      receivedChunks: new Set(),
      chunkData: new Map(),
    };

    if (manifest.chunk_count === 0 && manifest.size_bytes === 0) {
      await this.completePush(ctx);
    }
  }

  private async onChunk(chunk: InventorySnapshotChunkPayload, ctx: CommandContext): Promise<void> {
    if (!this.active || this.active.manifest.nonce !== chunk.nonce) return;

    const rawBytes = Buffer.from(chunk.data, 'base64');
    const verification = verifyInventorySnapshotChunk(chunk.data, chunk.chunk_sha256);
    const ok = verification.ok;

    ctx.transport.send({
      type: 'INVENTORY_SNAPSHOT_CHUNK_ACK',
      nonce: chunk.nonce,
      chunkIndex: chunk.chunk_index,
      chunk_index: chunk.chunk_index,
      status: ok ? 'ok' : 'error',
      message: ok ? undefined : 'chunk sha256 mismatch',
    });

    if (!ok) {
      await this.failPush(ctx, 'chunk verification failed');
      return;
    }

    this.active.receivedChunks.add(chunk.chunk_index);
    this.active.chunkData.set(chunk.chunk_index, rawBytes);

    if (this.active.receivedChunks.size >= this.active.manifest.chunk_count) {
      await this.completePush(ctx);
    }
  }

  private async completePush(ctx: CommandContext): Promise<void> {
    if (!this.active) return;
    const { manifest } = this.active;

    const parts: Buffer[] = [];
    for (let i = 0; i < manifest.chunk_count; i += 1) {
      const part = this.active.chunkData.get(i);
      if (!part) {
        await this.failPush(ctx, `missing chunk ${i}`);
        return;
      }
      parts.push(part);
    }

    const binary = Buffer.concat(parts);
    const hash = createHash('sha256').update(binary).digest('hex');
    if (hash !== manifest.sha256) {
      await this.failPush(ctx, 'assembled snapshot sha256 mismatch');
      return;
    }

    if (binary.length !== manifest.size_bytes) {
      await this.failPush(ctx, 'assembled snapshot size mismatch');
      return;
    }

    let appliedCount = manifest.device_count;
    try {
      const existing = ctx.registry.list();
      const { payload, mapped } = applyInventorySnapshotBinary(binary, existing);
      const items = mapped.map((row) => row.item);
      const denylistByKey = buildDenylistByKeyFromSnapshot(mapped);
      ctx.registry.loadInventorySnapshot(items, denylistByKey);
      appliedCount = items.length;
      const snapshotDenylistCount = countDenylistEntriesInMap(denylistByKey);
      ctx.onPersist?.();
      ctx.onDevicesChanged?.();
      if (ctx.canOperationalSync?.() !== false) {
        try {
          await ctx.proxy.stateSync(ctx.facilityId, ctx.registry.stateUpdates());
        } catch (syncErr) {
          ctx.onNotify?.({
            summary: `Inventory snapshot applied locally; state sync deferred (${syncErr instanceof Error ? syncErr.message : String(syncErr)})`,
            payload: { recoveryId: manifest.recovery_id, deviceCount: appliedCount },
          });
        }
      }
      ctx.onNotify?.({
        summary: snapshotDenylistCount > 0
          ? `Inventory snapshot applied — ${appliedCount} device(s), ${snapshotDenylistCount} denylist entries from cloud`
          : `Inventory snapshot applied — ${appliedCount} device(s) loaded from cloud push`,
        payload: {
          recoveryId: manifest.recovery_id,
          snapshotId: manifest.snapshot_id,
          facilityId: payload.facility_id,
          gatewayId: payload.gateway_id,
          deviceCount: appliedCount,
          denylistEntries: snapshotDenylistCount,
        },
      });

      ctx.transport.send({
        type: 'INVENTORY_SNAPSHOT_STATUS',
        recovery_id: manifest.recovery_id,
        snapshot_id: manifest.snapshot_id,
        status: 'success',
        message: `inventory snapshot applied (${appliedCount} devices)`,
      });

      this.active = null;

      if (ctx.onAfterInventorySnapshotApplied) {
        void ctx.onAfterInventorySnapshotApplied().catch((err) => {
          ctx.onNotify?.({
            summary: `Post-snapshot denylist sync failed (${err instanceof Error ? err.message : String(err)})`,
          });
        });
      }
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to apply inventory snapshot';
      await this.failPush(ctx, message);
      return;
    }
  }

  private async failPush(ctx: CommandContext, error: string): Promise<void> {
    if (!this.active) return;

    ctx.transport.send({
      type: 'INVENTORY_SNAPSHOT_STATUS',
      recovery_id: this.active.manifest.recovery_id,
      snapshot_id: this.active.manifest.snapshot_id,
      status: 'failed',
      error,
    });

    this.active = null;
  }

  reset(): void {
    this.active = null;
  }
}
