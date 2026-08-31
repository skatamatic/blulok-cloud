/**
 * Shared ACK-gated binary chunk push over gateway WebSocket.
 * Used by provisioning restore; mirrors firmware push flow.
 */

import * as crypto from 'crypto';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { FIRMWARE_CHUNK_SIZE_BYTES } from '@/constants/firmware-chunk.constants';
import { logger } from '@/utils/logger';

const CHUNK_SIZE_BYTES = FIRMWARE_CHUNK_SIZE_BYTES;
const MAX_CHUNK_RETRIES = 3;
const CHUNK_ACK_TIMEOUT_MS = 30_000;

interface ActiveChunkPush {
  cancel: boolean;
  disconnectPaused: boolean;
  nonce: string;
  facilityId: string;
  chunkAckResolvers: Map<number, { resolve: () => void; reject: (err: Error) => void }>;
}

const activePushes = new Map<string, ActiveChunkPush>();

export const _testActiveChunkPushes = activePushes;

export type ChunkPushOutcome =
  | { status: 'complete' }
  | { status: 'cancelled' }
  | { status: 'disconnect' }
  | { status: 'failed'; message: string };

export interface ChunkPushManifestConfig {
  pushId: string;
  facilityId: string;
  nonce: string;
  binary: Buffer;
  manifestCmdType: string;
  chunkCmdType: string;
  manifestMessageType: string;
  chunkMessageType: string;
  buildManifestPayload: (totalChunks: number, chunkSize: number) => Record<string, unknown>;
  buildChunkPayload: (
    chunkIndex: number,
    chunkSha256: string,
    chunkBase64: string,
  ) => Record<string, unknown>;
  startChunkIndex?: number;
  isCancelled?: () => boolean;
  isOnline?: () => boolean;
  onManifestSent?: () => Promise<void>;
  onChunkProgress?: (chunksSent: number, totalChunks: number, percent: number) => Promise<void>;
  onAllChunksSent?: (totalChunks: number) => Promise<void>;
  onFailed?: (message: string, chunksSent?: number, totalChunks?: number) => Promise<void>;
}

function defaultIsOnline(facilityId: string): boolean {
  try {
    const events = GatewayEventsService.getInstance();
    const getTransport = (events as { getTransport?: () => unknown }).getTransport;
    if (typeof getTransport === 'function') {
      const transport = getTransport.call(events) as {
        isRecoveryPushTargetOnline?: (id: string) => boolean;
        getRecoveryPushGatewayId?: (id: string) => string | undefined;
      };
      const pushTarget = transport?.getRecoveryPushGatewayId?.(facilityId);
      if (pushTarget) {
        return transport.isRecoveryPushTargetOnline?.(facilityId) ?? false;
      }
    }
    return events.getFacilityConnectionStatus(facilityId).connected;
  } catch {
    return false;
  }
}

export class GatewayChunkPushEngine {
  static registerPush(pushId: string, facilityId: string, nonce: string): ActiveChunkPush {
    const state: ActiveChunkPush = {
      cancel: false,
      disconnectPaused: false,
      nonce,
      facilityId,
      chunkAckResolvers: new Map(),
    };
    activePushes.set(pushId, state);
    return state;
  }

  static unregisterPush(pushId: string): void {
    activePushes.delete(pushId);
  }

  static cancelPush(pushId: string): void {
    const state = activePushes.get(pushId);
    if (state) {
      state.cancel = true;
      for (const resolver of state.chunkAckResolvers.values()) {
        try {
          resolver.reject(new Error('Push cancelled'));
        } catch {
          /* ignore */
        }
      }
      state.chunkAckResolvers.clear();
    }
  }

  static pausePushOnDisconnect(
    facilityId: string,
    options?: { excludePushIds?: ReadonlySet<string>; onlyPushIds?: ReadonlySet<string> },
  ): void {
    for (const [pushId, state] of activePushes.entries()) {
      if (state.facilityId !== facilityId || state.cancel) continue;
      if (options?.excludePushIds?.has(pushId)) continue;
      if (options?.onlyPushIds && !options.onlyPushIds.has(pushId)) continue;
      state.disconnectPaused = true;
      for (const resolver of state.chunkAckResolvers.values()) {
        try {
          resolver.reject(new Error('Gateway disconnected during chunk push'));
        } catch {
          /* ignore */
        }
      }
      state.chunkAckResolvers.clear();
      logger.info(`Chunk push paused due to gateway disconnect pushId=${pushId} facility=${facilityId}`);
    }
  }

  static async handleChunkAck(facilityId: string, msg: Record<string, unknown>): Promise<void> {
    const nonce = msg.nonce;
    const chunkIndex = msg.chunkIndex ?? msg.chunk_index;
    const status = msg.status;
    const message = msg.message;

    if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 128) {
      logger.warn(`Chunk ACK: invalid nonce facility=${facilityId}`);
      return;
    }
    if (typeof chunkIndex !== 'number' || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100_000) {
      logger.warn(`Chunk ACK: invalid chunkIndex=${String(chunkIndex)} facility=${facilityId}`);
      return;
    }

    for (const [pushId, pushState] of activePushes.entries()) {
      if (pushState.nonce !== nonce) continue;
      if (pushState.facilityId !== facilityId) {
        logger.warn(`Chunk ACK facility mismatch pushId=${pushId}`);
        continue;
      }

      const resolver = pushState.chunkAckResolvers.get(chunkIndex);
      if (resolver) {
        if (status === 'ok' || status === undefined) {
          resolver.resolve();
        } else {
          resolver.reject(new Error(typeof message === 'string' ? message : `Chunk ${chunkIndex} NAK`));
        }
        pushState.chunkAckResolvers.delete(chunkIndex);
        return;
      }
    }

    logger.warn(`Chunk ACK with no matching active push nonce=${nonce} facility=${facilityId} chunk=${chunkIndex}`);
  }

  static async executePush(config: ChunkPushManifestConfig): Promise<ChunkPushOutcome> {
    const {
      pushId,
      facilityId,
      nonce,
      binary,
      manifestCmdType,
      chunkCmdType,
      manifestMessageType,
      chunkMessageType,
      buildManifestPayload,
      buildChunkPayload,
      startChunkIndex = 0,
      isCancelled,
      isOnline = () => defaultIsOnline(facilityId),
      onManifestSent,
      onChunkProgress,
      onAllChunksSent,
      onFailed,
    } = config;

    const pushState = this.registerPush(pushId, facilityId, nonce);

    try {
      if (!isOnline()) {
        await onFailed?.('Gateway offline before chunk push start');
        return { status: 'failed', message: 'Gateway offline before chunk push start' };
      }

      const totalChunks = Math.ceil(binary.length / CHUNK_SIZE_BYTES);
      const manifestPayload = {
        cmd_type: manifestCmdType,
        ...buildManifestPayload(totalChunks, CHUNK_SIZE_BYTES),
        nonce,
      };
      const manifestJwt = await Ed25519Service.signCommandJwt(manifestPayload);

      // Always send manifest (including resume) so gateway can rehydrate state after reconnect.
      GatewayEventsService.getInstance().unicastToFacility(facilityId, {
        type: manifestMessageType,
        jwt: manifestJwt,
      });
      await new Promise((r) => setTimeout(r, 200));
      await onManifestSent?.();

      if (startChunkIndex > 0) {
        logger.info(
          `Resuming chunk push from chunk ${startChunkIndex}/${totalChunks} pushId=${pushId} facility=${facilityId}`,
        );
      }

      for (let i = startChunkIndex; i < totalChunks; i++) {
        if (isCancelled?.() || pushState.cancel) {
          logger.info(`Chunk push cancelled pushId=${pushId} at chunk ${i}/${totalChunks}`);
          return { status: 'cancelled' };
        }
        if (pushState.disconnectPaused) {
          logger.info(`Chunk push paused on disconnect pushId=${pushId} at chunk ${i}/${totalChunks}`);
          return { status: 'disconnect' };
        }

        const start = i * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, binary.length);
        const chunkData = binary.subarray(start, end);
        const chunkSha256 = crypto.createHash('sha256').update(chunkData).digest('hex');
        const chunkBase64 = chunkData.toString('base64');

        const chunkPayload = {
          cmd_type: chunkCmdType,
          nonce,
          chunk_index: i,
          chunk_sha256: chunkSha256,
          data: chunkBase64,
          ...buildChunkPayload(i, chunkSha256, chunkBase64),
        };
        const chunkJwt = await Ed25519Service.signCommandJwt(chunkPayload);

        let acked = false;
        for (let attempt = 0; attempt < MAX_CHUNK_RETRIES && !acked; attempt++) {
          if (isCancelled?.() || pushState.cancel) return { status: 'cancelled' };
          if (pushState.disconnectPaused) return { status: 'disconnect' };
          if (!isOnline()) {
            const msg = `Gateway went offline before chunk ${i} delivery`;
            await onFailed?.(msg, i, totalChunks);
            return { status: 'failed', message: msg };
          }

          GatewayEventsService.getInstance().unicastToFacility(facilityId, {
            type: chunkMessageType,
            jwt: chunkJwt,
          });

          try {
            await this.waitForChunkAck(pushId, i, pushState, CHUNK_ACK_TIMEOUT_MS);
            acked = true;
          } catch (err) {
            if (pushState.disconnectPaused) {
              return { status: 'disconnect' };
            }
            logger.warn(`Chunk ACK timeout pushId=${pushId} chunk=${i} attempt=${attempt + 1}/${MAX_CHUNK_RETRIES}`);
            if (attempt === MAX_CHUNK_RETRIES - 1) {
              const msg = `Chunk ${i} ACK failed after ${MAX_CHUNK_RETRIES} retries`;
              await onFailed?.(msg, i, totalChunks);
              return { status: 'failed', message: msg };
            }
          }
        }

        const chunksSent = i + 1;
        const percent = Math.round((chunksSent / totalChunks) * 100);
        await onChunkProgress?.(chunksSent, totalChunks, percent);
      }

      await onAllChunksSent?.(totalChunks);
      return { status: 'complete' };
    } catch (err) {
      logger.error(`Chunk push failed pushId=${pushId}:`, err);
      const message = String((err as Error)?.message || err);
      await onFailed?.(message);
      return { status: 'failed', message };
    } finally {
      this.unregisterPush(pushId);
    }
  }

  private static waitForChunkAck(
    pushId: string,
    chunkIndex: number,
    pushState: ActiveChunkPush,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pushState.chunkAckResolvers.delete(chunkIndex);
        reject(new Error(`Chunk ${chunkIndex} ACK timeout`));
      }, timeoutMs);

      pushState.chunkAckResolvers.set(chunkIndex, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }
}
