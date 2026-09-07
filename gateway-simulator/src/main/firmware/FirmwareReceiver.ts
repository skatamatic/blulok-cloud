import { createHash } from 'crypto';

import type { FirmwareChunkPayload, FirmwareManifestPayload, JwtCommandPayload } from '@protocol/commands';

import { decodeJwtPayload } from '../crypto/JwtCodec';

import type { CommandContext } from '../commands/ICommandHandler';

/** Minimum pause after last chunk ACK before terminal status — avoids racing backend executePush. */
const POST_TRANSFER_SETTLE_MS = 150;

type ActivePush = {
  manifest: FirmwareManifestPayload;
  receivedChunks: Set<number>;
  chunkData: Map<number, Buffer>;
};

function isV2Manifest(manifest: FirmwareManifestPayload): boolean {
  return manifest.delivery_mode === 'v2' || (typeof manifest.download_url === 'string' && manifest.download_url.length > 0);
}

export class FirmwareReceiver {
  private active: ActivePush | null = null;

  async handleMessage(raw: unknown, ctx: CommandContext): Promise<void> {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.jwt !== 'string') return;
    const payload = decodeJwtPayload(obj.jwt);
    await this.handleJwtPayload(payload, ctx);
  }

  async handleJwtPayload(payload: JwtCommandPayload, ctx: CommandContext): Promise<void> {
    if (payload.cmd_type === 'FIRMWARE_MANIFEST') {
      await this.onManifest(payload as FirmwareManifestPayload, ctx);
    } else if (payload.cmd_type === 'FIRMWARE_CHUNK') {
      await this.onChunk(payload as FirmwareChunkPayload, ctx);
    }
  }

  private async onManifest(manifest: FirmwareManifestPayload, ctx: CommandContext): Promise<void> {
    if (ctx.behavior.firmwareMode === 'stall') return;

    this.active = {
      manifest,
      receivedChunks: new Set(),
      chunkData: new Map(),
    };

    if (isV2Manifest(manifest)) {
      await this.downloadAndCompleteV2(ctx);
    }
  }

  /**
   * v2: HTTPS GET download_url, report FIRMWARE_PROGRESS, then apply lifecycle.
   */
  private async downloadAndCompleteV2(ctx: CommandContext): Promise<void> {
    if (!this.active) return;
    const { manifest } = this.active;

    if (ctx.behavior.firmwareMode === 'fail') {
      await this.failPush(ctx, 'simulator forced failure');
      return;
    }

    const url = manifest.download_url;
    if (!url) {
      await this.failPush(ctx, 'v2 manifest missing download_url');
      return;
    }

    this.sendProgress(ctx, manifest, 0, 'downloading');

    let binary: Buffer;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        await this.failPush(ctx, `download failed: HTTP ${response.status}`);
        return;
      }
      const contentLength = Number(response.headers.get('content-length') || 0);
      const reader = response.body?.getReader();
      if (!reader) {
        const ab = await response.arrayBuffer();
        binary = Buffer.from(ab);
        this.sendProgress(ctx, manifest, 100, 'downloading');
      } else {
        const chunks: Buffer[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(Buffer.from(value));
            received += value.byteLength;
            if (contentLength > 0) {
              const percent = Math.min(99, Math.round((received / contentLength) * 100));
              this.sendProgress(ctx, manifest, percent, 'downloading');
            }
          }
        }
        binary = Buffer.concat(chunks);
        this.sendProgress(ctx, manifest, 100, 'downloading');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.failPush(ctx, `download failed: ${message}`);
      return;
    }

    const hash = createHash('sha256').update(binary).digest('hex');
    if (hash !== manifest.sha256) {
      await this.failPush(ctx, 'downloaded binary sha256 mismatch');
      return;
    }

    if (manifest.size > 0 && binary.length !== manifest.size) {
      await this.failPush(ctx, `downloaded size mismatch: expected ${manifest.size}, got ${binary.length}`);
      return;
    }

    await this.completePush(ctx);
  }

  private async onChunk(chunk: FirmwareChunkPayload, ctx: CommandContext): Promise<void> {
    if (!this.active || this.active.manifest.nonce !== chunk.nonce) return;
    if (isV2Manifest(this.active.manifest)) return;
    if (ctx.behavior.firmwareMode === 'stall') return;

    const rawBytes = Buffer.from(chunk.data, 'base64');
    const hash = createHash('sha256').update(rawBytes).digest('hex');
    const ok = hash === chunk.chunk_sha256;

    ctx.transport.send({
      type: 'FIRMWARE_CHUNK_ACK',
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

    if (ctx.behavior.firmwareMode === 'fail') {
      await this.failPush(ctx, 'simulator forced failure');
      return;
    }

    if (this.active.receivedChunks.size >= this.active.manifest.chunk_count) {
      await this.completePush(ctx);
    }
  }

  private sendProgress(
    ctx: CommandContext,
    manifest: FirmwareManifestPayload,
    progressPercent: number,
    phase: string,
  ): void {
    ctx.transport.send({
      type: 'FIRMWARE_PROGRESS',
      push_id: manifest.push_id,
      target_type: manifest.target_type,
      progress_percent: progressPercent,
      phase,
    });
  }

  private sendUpdateStatus(
    ctx: CommandContext,
    manifest: FirmwareManifestPayload,
    status: string,
  ): void {
    ctx.transport.send({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: manifest.push_id,
      status,
      version: manifest.version,
      target_type: manifest.target_type,
    });
  }

  private async completePush(ctx: CommandContext): Promise<void> {
    if (!this.active) return;
    const { manifest } = this.active;

    // Match real gateway / e2e lifecycle: verifying → applying → success.
    // Pause after transfer so backend executePush can transition to verifying first.
    await new Promise((r) => setTimeout(r, POST_TRANSFER_SETTLE_MS));

    this.sendUpdateStatus(ctx, manifest, 'verifying');
    const verifyDelayMs = Math.max(ctx.behavior.firmwareVerifyDelayMs, 0);
    if (verifyDelayMs > 0) {
      await new Promise((r) => setTimeout(r, verifyDelayMs));
    }

    this.sendUpdateStatus(ctx, manifest, 'applying');
    await new Promise((r) => setTimeout(r, POST_TRANSFER_SETTLE_MS));

    if (manifest.target_type === 'gateway') {
      ctx.applyGatewayFirmware?.(manifest.version);
    } else {
      ctx.registry.applyFirmware(manifest.target_type, manifest.version);
    }

    ctx.onPersist?.();
    ctx.onDevicesChanged?.();

    this.sendUpdateStatus(ctx, manifest, 'success');

    await ctx.proxy.stateSync(ctx.facilityId, ctx.registry.stateUpdates());
    this.active = null;
  }

  private async failPush(ctx: CommandContext, error: string): Promise<void> {
    if (!this.active) return;
    ctx.transport.send({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: this.active.manifest.push_id,
      status: 'failed',
      version: this.active.manifest.version,
      target_type: this.active.manifest.target_type,
      error,
    });
    this.active = null;
  }

  reset(): void {
    this.active = null;
  }
}
