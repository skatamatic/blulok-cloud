import { randomUUID } from 'crypto';
import {
  OCCUPIED_UNLOCK_STATE_ATTRIBUTION_TTL_MS,
  occupiedUnlockIntentTtlMs,
} from '@/constants/occupied-unlock-intent.constants';
import { logger } from '@/utils/logger';

export type OccupiedUnlockOverridePayload = {
  reason: string;
  reasonLabel: string;
  notes?: string;
};

export type OccupiedUnlockIntent = {
  intentId: string;
  userId: string;
  userName: string;
  role: string;
  deviceId: string;
  unitId: string;
  facilityId: string;
  gatewayId?: string;
  override: OccupiedUnlockOverridePayload;
  expiresAtMs: number;
};

export type OccupiedUnlockStateAttribution = {
  intentId: string;
  userId: string;
  userName: string;
  role: string;
  deviceId: string;
  unitId?: string;
  facilityId: string;
  override: OccupiedUnlockOverridePayload;
  expiresAtMs: number;
};

/**
 * Short-lived, single-use intents for staff Occupied Unit Override on on-ground unlocks.
 * Process-local (same affinity caveats as LockCommandService pending attribution).
 */
export class OccupiedUnlockIntentService {
  private static instance: OccupiedUnlockIntentService | undefined;

  /** deviceId -> pending intent */
  private readonly pendingByDevice = new Map<string, OccupiedUnlockIntent>();
  /** deviceId -> brief window after access-event consume for unlock-state stamping */
  private readonly recentUnlockByDevice = new Map<string, OccupiedUnlockStateAttribution>();

  public static getInstance(): OccupiedUnlockIntentService {
    if (!OccupiedUnlockIntentService.instance) {
      OccupiedUnlockIntentService.instance = new OccupiedUnlockIntentService();
    }
    return OccupiedUnlockIntentService.instance;
  }

  public static resetForTests(): void {
    OccupiedUnlockIntentService.instance = undefined;
  }

  public createIntent(params: {
    userId: string;
    userName: string;
    role: string;
    deviceId: string;
    unitId: string;
    facilityId: string;
    gatewayId?: string;
    override: OccupiedUnlockOverridePayload;
  }): OccupiedUnlockIntent {
    this.purgeExpired();

    const existing = this.pendingByDevice.get(params.deviceId);
    if (existing && existing.userId !== params.userId && existing.expiresAtMs > Date.now()) {
      logger.warn('Occupied unlock intent refused: another user already has pending intent', {
        deviceId: params.deviceId,
        existingUserId: existing.userId,
        requesterUserId: params.userId,
      });
      throw new Error('OCCUPIED_UNLOCK_INTENT_IN_USE');
    }

    const intent: OccupiedUnlockIntent = {
      intentId: randomUUID(),
      userId: params.userId,
      userName: params.userName,
      role: params.role,
      deviceId: params.deviceId,
      unitId: params.unitId,
      facilityId: params.facilityId,
      gatewayId: params.gatewayId,
      override: params.override,
      expiresAtMs: Date.now() + occupiedUnlockIntentTtlMs(),
    };

    this.pendingByDevice.set(params.deviceId, intent);
    logger.info('Occupied unlock intent created', {
      intentId: intent.intentId,
      deviceId: intent.deviceId,
      userId: intent.userId,
      expiresAtMs: intent.expiresAtMs,
    });
    return intent;
  }

  /**
   * Atomically consume a pending intent when a matching access-event arrives.
   * Returns null when no match / expired / user mismatch / intent id mismatch.
   */
  public tryConsumeForAccessEvent(params: {
    deviceId: string;
    userId: string;
    intentIdFromMetadata?: string | null;
  }): OccupiedUnlockIntent | null {
    this.purgeExpired();
    const pending = this.pendingByDevice.get(params.deviceId);
    if (!pending) {
      return null;
    }
    if (pending.expiresAtMs <= Date.now()) {
      this.pendingByDevice.delete(params.deviceId);
      return null;
    }
    if (pending.userId !== params.userId) {
      return null;
    }
    if (
      params.intentIdFromMetadata
      && params.intentIdFromMetadata !== pending.intentId
    ) {
      return null;
    }

    this.pendingByDevice.delete(params.deviceId);

    const stateAttr: OccupiedUnlockStateAttribution = {
      intentId: pending.intentId,
      userId: pending.userId,
      userName: pending.userName,
      role: pending.role,
      deviceId: pending.deviceId,
      unitId: pending.unitId,
      facilityId: pending.facilityId,
      override: pending.override,
      expiresAtMs: Date.now() + OCCUPIED_UNLOCK_STATE_ATTRIBUTION_TTL_MS,
    };
    this.recentUnlockByDevice.set(params.deviceId, stateAttr);

    return pending;
  }

  /**
   * Atomically consume the brief post-access-event window for physical unlock stamping.
   * Only valid for a real locked→unlocked (or other→unlocked) transition — caller enforces old!==new.
   */
  public tryConsumeForUnlockState(deviceId: string): OccupiedUnlockStateAttribution | null {
    this.purgeExpired();
    const recent = this.recentUnlockByDevice.get(deviceId);
    if (!recent) {
      return null;
    }
    if (recent.expiresAtMs <= Date.now()) {
      this.recentUnlockByDevice.delete(deviceId);
      return null;
    }
    this.recentUnlockByDevice.delete(deviceId);
    return recent;
  }

  /** Test helper */
  public peekPending(deviceId: string): OccupiedUnlockIntent | null {
    this.purgeExpired();
    return this.pendingByDevice.get(deviceId) ?? null;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [deviceId, intent] of this.pendingByDevice.entries()) {
      if (intent.expiresAtMs <= now) {
        this.pendingByDevice.delete(deviceId);
      }
    }
    for (const [deviceId, recent] of this.recentUnlockByDevice.entries()) {
      if (recent.expiresAtMs <= now) {
        this.recentUnlockByDevice.delete(deviceId);
      }
    }
  }
}
