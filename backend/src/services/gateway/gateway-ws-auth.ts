import { logger } from '@/utils/logger';
import { isValidGatewayUuid, type AutoRegisterReject } from '@/utils/gateway-auto-register.utils';
import type { RemoteWebSocket } from './gateway-ws-session-registry';

export type EcdsaChallengePending = {
  gatewayId: string;
  facilityId: string;
  publicKey: string;
  nonce: string;
  expiresAt: number;
  firmware_version?: string;
};

// ── Auto-registration guardrails ──
const MAX_SWAP_CANDIDATES_PER_FACILITY = 3;
const AUTO_REGISTER_WINDOW_MS = 10 * 60_000;
const AUTO_REGISTER_MAX_PER_WINDOW = 5;

/**
 * GatewayWsAuthHelper
 *
 * Manages ECDSA challenge flow, auto-registration rate limiting, and
 * swap-candidate creation helpers used during AUTH.
 */
export class GatewayWsAuthHelper {
  private readonly ecdsaChallenges = new WeakMap<RemoteWebSocket, EcdsaChallengePending>();
  private autoRegisterEvents = new Map<string, number[]>();

  // ─────────────────────────────────────────────────────────────────────────
  // ECDSA challenge management
  // ─────────────────────────────────────────────────────────────────────────

  setChallenge(ws: RemoteWebSocket, challenge: EcdsaChallengePending): void {
    this.ecdsaChallenges.set(ws, challenge);
  }

  getChallenge(ws: RemoteWebSocket): EcdsaChallengePending | undefined {
    return this.ecdsaChallenges.get(ws);
  }

  deleteChallenge(ws: RemoteWebSocket): void {
    this.ecdsaChallenges.delete(ws);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-registration rate limiting
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Records an auto-registration event and returns false if the facility has exceeded
   * the sliding-window rate limit. Prunes expired timestamps.
   */
  allowAutoRegister(facilityId: string): boolean {
    const now = Date.now();
    const windowStart = now - AUTO_REGISTER_WINDOW_MS;
    const events = (this.autoRegisterEvents.get(facilityId) || []).filter((ts) => ts >= windowStart);
    if (events.length >= AUTO_REGISTER_MAX_PER_WINDOW) {
      this.autoRegisterEvents.set(facilityId, events);
      return false;
    }
    events.push(now);
    this.autoRegisterEvents.set(facilityId, events);
    return true;
  }

  /**
   * Check auto-registration limits without recording an event.
   */
  checkAutoRegisterLimits(
    facilityId: string,
    gatewayId: string,
    swapCandidateCount: number,
    options: { enforceCandidateCap?: boolean; enforceRateLimit?: boolean },
  ): AutoRegisterReject | null {
    if (!isValidGatewayUuid(gatewayId)) {
      return { code: 'AUTH_BAD_REQUEST', message: 'gatewayId must be a valid UUID' };
    }
    if (options.enforceCandidateCap !== false) {
      if (swapCandidateCount >= MAX_SWAP_CANDIDATES_PER_FACILITY) {
        return { code: 'AUTH_FORBIDDEN', message: 'Swap candidate limit reached for facility' };
      }
    }
    if (options.enforceRateLimit !== false && !this.allowAutoRegister(facilityId)) {
      return { code: 'AUTH_RATE_LIMITED', message: 'Too many gateway registrations; try again later' };
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-registration activity logging
  // ─────────────────────────────────────────────────────────────────────────

  async logAutoRegistration(params: {
    facilityId: string;
    gatewayId: string;
    bound: boolean;
    userId: string;
  }): Promise<void> {
    try {
      const { ActivityService } = await import('@/services/activity.service');
      await ActivityService.getInstance().logActivity({
        entityType: 'gateway',
        entityId: params.gatewayId,
        activityType: 'configuration_change',
        title: params.bound ? 'Gateway auto-registered and bound' : 'Gateway auto-registered as swap candidate',
        description: params.bound
          ? 'A new gateway connected and was auto-registered as the facility gateway (first install).'
          : 'A new gateway connected and was auto-registered as an unbound swap candidate.',
        actorType: 'user',
        actorId: params.userId,
        result: 'success',
        facilityId: params.facilityId,
        metadata: { autoRegistered: true, bound: params.bound, gatewayId: params.gatewayId },
      });
    } catch (err) {
      logger.warn(`Failed to log gateway auto-registration facility=${params.facilityId} gateway=${params.gatewayId}`, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Unbound swap candidate DB creation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Ensure an unbound gateway row exists for swap-candidate parking (idempotent).
   * Creates the row when absent; safe under concurrent AUTH with the same GUID.
   */
  async ensureUnboundSwapCandidateRecord(
    gatewayModel: InstanceType<Awaited<typeof import('@/models/gateway.model')>['GatewayModel']>,
    gatewayId: string,
    facilityId: string,
    userId: string,
    swapCandidateCount: number,
    options: { enforceCandidateCap?: boolean; enforceRateLimit?: boolean },
  ): Promise<{ ok: true; created: boolean } | { ok: false; reject: AutoRegisterReject }> {
    const existing = await gatewayModel.findById(gatewayId);
    if (existing?.facility_id && existing.facility_id !== facilityId) {
      return { ok: false, reject: { code: 'AUTH_FORBIDDEN', message: 'Gateway belongs to another facility' } };
    }
    if (existing) {
      return { ok: true, created: false };
    }

    const limitReject = this.checkAutoRegisterLimits(facilityId, gatewayId, swapCandidateCount, options);
    if (limitReject) {
      return { ok: false, reject: limitReject };
    }

    const { created } = await gatewayModel.createUnboundSwapCandidateIfAbsent({
      id: gatewayId,
      name: `Swap candidate ${gatewayId.slice(0, 8)}`,
      metadata: { autoRegistered: true },
    });

    if (created) {
      await this.logAutoRegistration({ facilityId, gatewayId, bound: false, userId });
      logger.info(`Gateway WS auto-registered swap candidate facility=${facilityId} gateway=${gatewayId}`);
    }

    return { ok: true, created };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Constants re-exported for transport access
// ─────────────────────────────────────────────────────────────────────────

export const AUTH_CONSTANTS = {
  MAX_SWAP_CANDIDATES_PER_FACILITY,
  AUTO_REGISTER_WINDOW_MS,
  AUTO_REGISTER_MAX_PER_WINDOW,
} as const;
