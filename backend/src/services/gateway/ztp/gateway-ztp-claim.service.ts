import type { WebSocket } from 'ws';
import { GatewayModel } from '@/models/gateway.model';
import { ZtpPendingStore } from './ztp-pending.store';
import { constantTimeEqualString } from './gateway-ztp-crypto.utils';
import { logger } from '@/utils/logger';
import type { GatewaySessionRole } from '@/services/gateway/message-types';

export type ClaimGatewayInput = {
  facilityId: string;
  deviceId: string;
  publicKey: string;
  userId: string;
  name?: string;
};

export type ClaimGatewayResult =
  | {
      ok: true;
      gatewayId: string;
      facilityId: string;
      created: boolean;
      bound: boolean;
      sessionRole: GatewaySessionRole;
    }
  | { ok: false; status: number; code: string; message: string };

/**
 * Atomic sticker claim: match live pending session pubkey, persist gateway row, push ASSIGNED.
 * When the facility already has a bound gateway, persists an unbound identity for swap-candidate AUTH.
 */
export class GatewayZtpClaimService {
  private static instance: GatewayZtpClaimService;
  private readonly pending = ZtpPendingStore.getInstance();
  private readonly gatewayModel = new GatewayModel();

  public static getInstance(): GatewayZtpClaimService {
    if (!GatewayZtpClaimService.instance) {
      GatewayZtpClaimService.instance = new GatewayZtpClaimService();
    }
    return GatewayZtpClaimService.instance;
  }

  public async claim(input: ClaimGatewayInput): Promise<ClaimGatewayResult> {
    const session = this.pending.get(input.deviceId);
    if (!session) {
      return {
        ok: false,
        status: 425,
        code: 'DEVICE_NOT_ONLINE',
        message: 'Device not online in provisioning mode — plug in gateway, wait for ready, retry',
      };
    }

    if (!constantTimeEqualString(session.publicKey, input.publicKey)) {
      return {
        ok: false,
        status: 401,
        code: 'PUBLIC_KEY_MISMATCH',
        message: 'Sticker public key does not match the live provisioning session',
      };
    }

    try {
      const { gateway, created, bound } = await this.gatewayModel.claimViaZtp({
        deviceId: input.deviceId,
        facilityId: input.facilityId,
        publicKey: input.publicKey,
        claimedByUserId: input.userId,
        name: input.name,
      });

      const sessionRole: GatewaySessionRole = bound ? 'active' : 'swap_candidate';

      // Re-resolve pending after DB write — only push ASSIGNED to a session that still matches the claimed key
      const liveSession = this.pending.get(input.deviceId);
      const target =
        liveSession && constantTimeEqualString(liveSession.publicKey, input.publicKey)
          ? liveSession
          : constantTimeEqualString(session.publicKey, input.publicKey)
            ? session
            : null;
      if (target) {
        this.pushAssigned(target.ws, {
          gatewayId: gateway.id,
          facilityId: input.facilityId,
          sessionRole,
        });
        this.pending.remove(input.deviceId);
      } else {
        logger.warn(
          `ZTP claim persisted but PROVISION_ASSIGNED skipped (pending session key mismatch) device=${input.deviceId}`,
        );
      }

      logger.info(
        `ZTP claim success device=${input.deviceId} facility=${input.facilityId} user=${input.userId} created=${created} bound=${bound} role=${sessionRole}`,
      );
      return {
        ok: true,
        gatewayId: gateway.id,
        facilityId: input.facilityId,
        created,
        bound,
        sessionRole,
      };
    } catch (err: any) {
      const code = err?.code || err?.message;
      if (code === 'ALREADY_CLAIMED' || code === 'GATEWAY_REVOKED' || code === 'PUBLIC_KEY_MISMATCH') {
        return {
          ok: false,
          status: 409,
          code: String(code),
          message:
            code === 'GATEWAY_REVOKED'
              ? 'Gateway identity has been revoked'
              : code === 'PUBLIC_KEY_MISMATCH'
                ? 'Stored public key does not match claim'
                : 'Device already claimed',
        };
      }
      logger.error('ZTP claim failed', err);
      return { ok: false, status: 500, code: 'CLAIM_FAILED', message: 'Claim failed' };
    }
  }

  private pushAssigned(
    ws: WebSocket,
    payload: { gatewayId: string; facilityId: string; sessionRole: GatewaySessionRole },
  ): void {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'PROVISION_ASSIGNED',
            gatewayId: payload.gatewayId,
            facilityId: payload.facilityId,
            sessionRole: payload.sessionRole,
          }),
        );
      }
    } catch (err) {
      logger.warn('Failed to push PROVISION_ASSIGNED', err);
    }
  }
}
