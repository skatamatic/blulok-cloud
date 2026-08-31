/**
 * FirmwareService
 *
 * Thin facade maintaining backward-compatible static API for routes and gateway
 * handlers. Delegates to FirmwareCatalogService (upload/list/delete/prune) and
 * FirmwarePushEngineService (push execution, ACK/progress handling, disconnect/resume).
 *
 * Message handlers (handleChunkAck, handleProgress, handleFacilityDisconnect, etc.)
 * route directly to the engine.
 */

import { FirmwareImage, FirmwareTargetType } from '@/models/firmware.model';
import { FirmwarePush, FirmwarePushStatus, FirmwareDeliveryMode } from '@/models/firmware-push.model';
import { FirmwareCatalogService } from './firmware-catalog.service';
import {
  FirmwarePushEngineService,
  FirmwareUpdateStatusResult,
  normalizeFirmwareDeliveryMode as engineNormalizeFirmwareDeliveryMode,
} from './firmware-push-engine.service';
import {
  _testActivePushes,
  _testResumeInFlightPushes,
  _testClearPendingTimers,
  assertTimeoutOverrideMs,
  transferDisconnectGraceMs,
  verifyDisconnectGraceMs,
  getTransferDisconnectGraceMsOverride,
  setTransferDisconnectGraceMsOverrideValue,
  getVerifyDisconnectGraceMsOverride,
  setVerifyDisconnectGraceMsOverrideValue,
} from './firmware-push-session.store';
import { FirmwareSignedUploadSession } from './firmware-storage.factory';
import { logger } from '@/utils/logger';
import {
  DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS,
  DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS,
} from '@/constants/firmware-timeout.constants';

// Re-export helper for routes/handlers
export { normalizeFirmwareDeliveryMode } from './firmware-push-engine.service';

// Re-export types for consumers
export type { FirmwareUpdateStatusResult } from './firmware-push-engine.service';

// Re-export test utilities
export { _testActivePushes, _testResumeInFlightPushes, _testClearPendingTimers };

export class FirmwareService {
  // =========================================================================
  // Dev / e2e timeout overrides
  // =========================================================================

  static getTransferDisconnectGraceMs(): number {
    return transferDisconnectGraceMs();
  }

  static getVerifyDisconnectGraceMs(): number {
    return verifyDisconnectGraceMs();
  }

  static isTransferDisconnectGraceOverrideActive(): boolean {
    return getTransferDisconnectGraceMsOverride() !== null;
  }

  static isVerifyDisconnectGraceOverrideActive(): boolean {
    return getVerifyDisconnectGraceMsOverride() !== null;
  }

  /**
   * Dev/e2e: temporarily override transfer reconnect grace for this process.
   * Pass `null` to restore the env/default value.
   */
  static setTransferDisconnectGraceMsOverride(ms: number | null): number {
    if (ms === null) {
      setTransferDisconnectGraceMsOverrideValue(null);
      logger.info(
        `Firmware transfer disconnect grace override cleared (default=${DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS}ms)`,
      );
      return transferDisconnectGraceMs();
    }
    const rounded = assertTimeoutOverrideMs(ms, 'transfer_disconnect_grace_ms');
    setTransferDisconnectGraceMsOverrideValue(rounded);
    logger.info(
      `Firmware transfer disconnect grace override set to ${rounded}ms (default=${DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS}ms)`,
    );
    return rounded;
  }

  /**
   * Dev/e2e: temporarily override verifying disconnect grace for this process.
   * Pass `null` to restore the env/default value.
   */
  static setVerifyDisconnectGraceMsOverride(ms: number | null): number {
    if (ms === null) {
      setVerifyDisconnectGraceMsOverrideValue(null);
      logger.info(
        `Firmware verify disconnect grace override cleared (default=${DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS}ms)`,
      );
      return verifyDisconnectGraceMs();
    }
    const rounded = assertTimeoutOverrideMs(ms, 'verify_disconnect_grace_ms');
    setVerifyDisconnectGraceMsOverrideValue(rounded);
    logger.info(
      `Firmware verify disconnect grace override set to ${rounded}ms (default=${DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS}ms)`,
    );
    return rounded;
  }

  static getTimeoutSnapshot(): {
    transfer_disconnect_grace_ms: number;
    verify_disconnect_grace_ms: number;
    default_transfer_disconnect_grace_ms: number;
    default_verify_disconnect_grace_ms: number;
    transfer_override_active: boolean;
    verify_override_active: boolean;
  } {
    return {
      transfer_disconnect_grace_ms: transferDisconnectGraceMs(),
      verify_disconnect_grace_ms: verifyDisconnectGraceMs(),
      default_transfer_disconnect_grace_ms: DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS,
      default_verify_disconnect_grace_ms: DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS,
      transfer_override_active: getTransferDisconnectGraceMsOverride() !== null,
      verify_override_active: getVerifyDisconnectGraceMsOverride() !== null,
    };
  }

  // =========================================================================
  // Catalog (upload/list/delete/prune) — delegates to FirmwareCatalogService
  // =========================================================================

  static async uploadFirmware(
    file: { originalname: string; buffer: Buffer; size: number },
    metadata: {
      version: string;
      target_type?: FirmwareTargetType;
      description?: string;
      release_notes?: string;
      compatible_models?: string[];
      minimum_version?: string;
    },
    userId: string,
  ): Promise<FirmwareImage> {
    return FirmwareCatalogService.uploadFirmware(file, metadata, userId);
  }

  static async initFirmwareUpload(
    file: { originalname: string; size: number },
    metadata: {
      version: string;
      target_type?: FirmwareTargetType;
      description?: string;
      release_notes?: string;
      compatible_models?: string[];
      minimum_version?: string;
    },
    clientOrigin?: string,
  ): Promise<
    | { upload_mode: 'direct_multipart' }
    | ({ upload_mode: 'signed_url' } & FirmwareSignedUploadSession)
  > {
    return FirmwareCatalogService.initFirmwareUpload(file, metadata, clientOrigin);
  }

  static async completeFirmwareUpload(
    uploadId: string,
    file: { originalname: string; size: number },
    metadata: {
      version: string;
      target_type?: FirmwareTargetType;
      description?: string;
      release_notes?: string;
      compatible_models?: string[];
      minimum_version?: string;
    },
    userId: string,
  ): Promise<FirmwareImage> {
    return FirmwareCatalogService.completeFirmwareUpload(uploadId, file, metadata, userId);
  }

  static async listFirmware(targetType?: FirmwareTargetType): Promise<FirmwareImage[]> {
    return FirmwareCatalogService.listFirmware(targetType);
  }

  static async getFirmware(id: string): Promise<FirmwareImage | null> {
    return FirmwareCatalogService.getFirmware(id);
  }

  static async getDeliveryCapabilities(): Promise<{
    v1_available: boolean;
    v2_available: boolean;
    v2_unavailable_reason?: string;
  }> {
    return FirmwareCatalogService.getDeliveryCapabilities();
  }

  static async deleteFirmware(id: string): Promise<boolean> {
    return FirmwareCatalogService.deleteFirmware(id);
  }

  static async pruneFirmwareRetention(targetType?: FirmwareTargetType): Promise<number> {
    return FirmwareCatalogService.pruneFirmwareRetention(targetType);
  }

  static scheduleRetentionPrune(targetType?: FirmwareTargetType): void {
    FirmwareCatalogService.scheduleRetentionPrune(targetType);
  }

  static async pruneFirmwareRetentionOnStartup(): Promise<void> {
    return FirmwareCatalogService.pruneFirmwareRetentionOnStartup();
  }

  // =========================================================================
  // Push Lifecycle — delegates to FirmwarePushEngineService
  // =========================================================================

  static async getPushById(pushId: string): Promise<FirmwarePush | null> {
    return FirmwarePushEngineService.getPushById(pushId);
  }

  static async initiatePush(
    firmwareId: string,
    gatewayId: string,
    facilityId: string,
    userId: string,
    options?: { deliveryMode?: FirmwareDeliveryMode | string },
  ): Promise<FirmwarePush> {
    const push = await FirmwarePushEngineService.initiatePush(
      firmwareId,
      gatewayId,
      facilityId,
      userId,
      options,
    );
    FirmwareCatalogService.scheduleRetentionPrune(push.target_type);
    return push;
  }

  static async getPushStatus(
    gatewayId: string,
    targetType?: FirmwareTargetType,
  ): Promise<FirmwarePush | null> {
    return FirmwarePushEngineService.getPushStatus(gatewayId, targetType);
  }

  static async getPushHistory(
    gatewayId: string,
    targetType?: FirmwareTargetType,
    limit = 50,
    offset = 0,
  ): Promise<FirmwarePush[]> {
    return FirmwarePushEngineService.getPushHistory(gatewayId, targetType, limit, offset);
  }

  static async cancelPush(pushId: string): Promise<void> {
    return FirmwarePushEngineService.cancelPush(pushId);
  }

  static async executePush(pushId: string): Promise<void> {
    return FirmwarePushEngineService.executePush(pushId);
  }

  // =========================================================================
  // Message Handlers (called by WS transport) — delegates to engine
  // =========================================================================

  static async handleChunkAck(facilityId: string, msg: any): Promise<void> {
    return FirmwarePushEngineService.handleChunkAck(facilityId, msg);
  }

  static async handleUpdateStatus(
    facilityId: string,
    msg: any,
  ): Promise<FirmwareUpdateStatusResult> {
    return FirmwarePushEngineService.handleUpdateStatus(facilityId, msg);
  }

  static async handleProgress(facilityId: string, msg: any): Promise<void> {
    return FirmwarePushEngineService.handleProgress(facilityId, msg);
  }

  // =========================================================================
  // Disconnect / Resume — delegates to engine
  // =========================================================================

  static async handleFacilityDisconnect(
    facilityId: string,
    options?: { disconnectedSessionRole?: 'active' | 'swap_candidate' },
  ): Promise<void> {
    return FirmwarePushEngineService.handleFacilityDisconnect(facilityId, options);
  }

  static async resumePendingForFacility(facilityId: string): Promise<void> {
    return FirmwarePushEngineService.resumePendingForFacility(facilityId);
  }

  static async recoverInFlightStateOnStartup(): Promise<void> {
    return FirmwarePushEngineService.recoverInFlightStateOnStartup();
  }
}
