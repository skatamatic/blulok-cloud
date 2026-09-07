import WebSocket from 'ws';
import { logger } from '@/utils/logger';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { GatewayDebugService } from '@/services/gateway/gateway-debug.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { config } from '@/config/environment';
import { isValidGatewayUuid } from '@/utils/gateway-auto-register.utils';
import {
  ZTP_GW_AUTH_PREFIX,
  buildZtpSignPayload,
  verifyZtpSignature,
} from '@/services/gateway/ztp/gateway-ztp-crypto.utils';
import type { GatewaySessionRole } from './message-types';
import type { GatewayWsSessionRegistry, AuthedClient, JWTPayload, RemoteWebSocket } from './gateway-ws-session-registry';
import { getRemoteAddress, safeSend } from './gateway-ws-session-registry';
import type { GatewayWsAuthHelper } from './gateway-ws-auth';
import type { ApiProxyService } from './api-proxy.service';

export type MessageDispatchContext = {
  ws: RemoteWebSocket;
  authed: AuthedClient | null;
  setAuthed: (client: AuthedClient | null) => void;
  closeAndCleanup: (reason?: string) => void;
};

export type DispatcherDependencies = {
  registry: GatewayWsSessionRegistry;
  authHelper: GatewayWsAuthHelper;
  apiProxy: ApiProxyService;
  scheduleActiveSessionCommandFlush: (facilityId: string) => void;
};

/**
 * Safely extract tid (transaction ID) from request body.
 */
function extractTid(body: any): number | string | undefined {
  if (body && typeof body === 'object' && body !== null && 'tid' in body) {
    const tid = body.tid;
    if (typeof tid === 'number' || typeof tid === 'string') {
      return tid;
    }
  }
  return undefined;
}

/**
 * Merge tid into response body while preserving response type.
 */
function mergeTidIntoResponse<T>(responseBody: T, tid: number | string | undefined): T & { tid?: number | string } {
  if (tid !== undefined) {
    return { ...responseBody, tid } as T & { tid: number | string };
  }
  return responseBody as T & { tid?: number | string };
}

/**
 * GatewayWsMessageDispatcher
 *
 * Handles inbound WebSocket messages by type (AUTH, AUTH_HELLO, AUTH_PROOF, PONG,
 * PROXY_REQUEST, firmware messages, inventory snapshot messages, etc.).
 */
export class GatewayWsMessageDispatcher {
  constructor(private deps: DispatcherDependencies) {}

  async dispatch(ctx: MessageDispatchContext, msg: any): Promise<void> {
    const { ws, authed, setAuthed, closeAndCleanup } = ctx;
    const typeField = msg?.type;
    const type = typeof typeField === 'string' ? typeField : '';

    // PONG handling (any client, even pre-auth)
    if (type === 'PONG') {
      this.handlePong(ctx);
      return;
    }

    // Update activity timestamp for authenticated clients
    if (authed) {
      const now = Date.now();
      authed.lastActivityAt = now;
      GatewayDebugService.getInstance().publish({
        kind: 'message_inbound',
        facilityId: authed.facilityId,
        userId: authed.user.userId,
        type,
        direction: 'incoming',
        ts: now,
        lastActivityAt: now,
      });
    }

    // AUTH_HELLO - ECDSA challenge initiation
    if (type === 'AUTH_HELLO') {
      await this.handleAuthHello(ctx, msg);
      return;
    }

    // AUTH_PROOF - ECDSA signature verification
    if (type === 'AUTH_PROOF') {
      await this.handleAuthProof(ctx, msg);
      return;
    }

    // AUTH - JWT authentication
    if (type === 'AUTH') {
      await this.handleJwtAuth(ctx, msg);
      return;
    }

    // Require authentication for all other message types
    if (!authed) {
      const remote = getRemoteAddress(ws);
      logger.warn(`Gateway WS message before AUTH (type=${typeField}) remote=${remote} - closing`);
      safeSend(ws, { type: 'ERROR', code: 'NOT_AUTHENTICATED', message: 'Send AUTH or AUTH_HELLO first' });
      return;
    }

    // PROXY_REQUEST
    if (type === 'PROXY_REQUEST') {
      await this.handleProxyRequest(ctx, msg, authed);
      return;
    }

    // Firmware messages
    if (type === 'FIRMWARE_CHUNK_ACK' || type === 'FIRMWARE_UPDATE_STATUS' || type === 'FIRMWARE_PROGRESS') {
      await this.handleFirmwareMessage(ctx, msg, authed, type);
      return;
    }

    // Inventory snapshot messages
    if (type === 'INVENTORY_SNAPSHOT_CHUNK_ACK' || type === 'INVENTORY_SNAPSHOT_STATUS') {
      await this.handleInventorySnapshotMessage(ctx, msg, authed, type);
      return;
    }

    // ACCESS_CODE_UPDATE_ACK
    if (type === 'ACCESS_CODE_UPDATE_ACK') {
      await this.handleAccessCodeUpdateAck(authed, msg);
      return;
    }

    // DEVICE_DELETED_ACK
    if (type === 'DEVICE_DELETED_ACK') {
      await this.handleDeviceDeletedAck(authed, msg);
      return;
    }

    // Unknown message
    logger.warn(`Gateway WS unknown message type=${typeField} facility=${authed?.facilityId || 'n/a'}`);
    safeSend(ws, { type: 'ERROR', code: 'UNKNOWN_TYPE', message: `Unknown type ${typeField}` });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PONG handler
  // ─────────────────────────────────────────────────────────────────────────

  private handlePong(ctx: MessageDispatchContext): void {
    const { ws, authed } = ctx;
    const remote = getRemoteAddress(ws);
    if (authed) {
      logger.debug?.('Gateway WS PONG received', {
        facilityId: authed.facilityId,
        userId: authed.user.userId,
        remote,
      });
      const now = Date.now();
      authed.lastActivityAt = now;
      GatewayDebugService.getInstance().publish({
        kind: 'pong_received',
        facilityId: authed.facilityId,
        userId: authed.user.userId,
        ts: now,
        lastActivityAt: authed.lastActivityAt,
        remote,
      });
      safeSend(ws, { type: 'PONG_OK', ts: Date.now() });
    } else {
      logger.debug?.('Gateway WS PONG received before AUTH completed', { remote });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH_HELLO handler (ZTP challenge initiation)
  // ─────────────────────────────────────────────────────────────────────────

  private async handleAuthHello(ctx: MessageDispatchContext, msg: any): Promise<void> {
    const { ws, closeAndCleanup } = ctx;
    const remote = getRemoteAddress(ws);
    const gatewayId = String(msg?.gatewayId || msg?.gateway_id || '');
    if (!gatewayId || !isValidGatewayUuid(gatewayId)) {
      safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'gatewayId required (UUID)' });
      return closeAndCleanup();
    }
    const helloFacilityId =
      typeof msg?.facilityId === 'string' && msg.facilityId.trim()
        ? String(msg.facilityId).trim()
        : typeof msg?.facility_id === 'string' && msg.facility_id.trim()
          ? String(msg.facility_id).trim()
          : undefined;

    const { GatewayModel } = await import('@/models/gateway.model');
    const { getZtpIntendedFacilityId } = await import('@/utils/gateway-ztp-claim.utils');
    const gatewayModel = new GatewayModel();
    const gateway = await gatewayModel.findById(gatewayId);
    if (!gateway?.public_key) {
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway not claimed for ZTP auth' });
      return closeAndCleanup();
    }
    if (gateway.revoked_at) {
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Gateway revoked' });
      return closeAndCleanup();
    }
    if (gateway.released_at) {
      safeSend(ws, {
        type: 'ERROR',
        code: 'AUTH_FAILED',
        message: 'Gateway unbound — use provision flow',
      });
      return closeAndCleanup();
    }

    let facilityId: string;
    if (gateway.facility_id) {
      if (helloFacilityId && helloFacilityId !== gateway.facility_id) {
        safeSend(ws, {
          type: 'ERROR',
          code: 'AUTH_FORBIDDEN',
          message: 'facilityId does not match bound gateway',
        });
        return closeAndCleanup();
      }
      facilityId = gateway.facility_id;
    } else {
      const intended = getZtpIntendedFacilityId(gateway.metadata);
      if (!intended) {
        safeSend(ws, {
          type: 'ERROR',
          code: 'AUTH_FAILED',
          message: 'Gateway unbound — use provision flow',
        });
        return closeAndCleanup();
      }
      if (helloFacilityId && helloFacilityId !== intended) {
        safeSend(ws, {
          type: 'ERROR',
          code: 'AUTH_FORBIDDEN',
          message: 'facilityId does not match ZTP claim',
        });
        return closeAndCleanup();
      }
      facilityId = intended;
    }

    const { randomBytes } = await import('crypto');
    const nonce = randomBytes(32).toString('base64url');
    this.deps.authHelper.setChallenge(ws, {
      gatewayId,
      facilityId,
      publicKey: gateway.public_key,
      nonce,
      expiresAt: Date.now() + 60_000,
      firmware_version:
        typeof msg?.firmware_version === 'string' ? msg.firmware_version : undefined,
    });
    safeSend(ws, { type: 'AUTH_CHALLENGE', nonce, expires_in_seconds: 60 });
    logger.info(
      `Gateway WS AUTH_HELLO challenge issued gateway=${gatewayId} facility=${facilityId} remote=${remote}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH_PROOF handler (ZTP signature verification)
  // ─────────────────────────────────────────────────────────────────────────

  private async handleAuthProof(ctx: MessageDispatchContext, msg: any): Promise<void> {
    const { ws, setAuthed, closeAndCleanup } = ctx;
    const remote = getRemoteAddress(ws);
    const pending = this.deps.authHelper.getChallenge(ws);
    if (!pending || Date.now() > pending.expiresAt) {
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Challenge expired or missing' });
      return closeAndCleanup();
    }
    const signature = String(msg?.signature || msg?.proof || '');
    const payload = buildZtpSignPayload(ZTP_GW_AUTH_PREFIX, pending.nonce, pending.gatewayId);
    if (!verifyZtpSignature(pending.publicKey, payload, signature)) {
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Invalid signature' });
      return closeAndCleanup();
    }
    this.deps.authHelper.deleteChallenge(ws);

    // Re-validate live DB state
    const { GatewayModel } = await import('@/models/gateway.model');
    const { getZtpIntendedFacilityId } = await import('@/utils/gateway-ztp-claim.utils');
    const gatewayModel = new GatewayModel();
    const liveGateway = await gatewayModel.findById(pending.gatewayId);
    if (!liveGateway?.public_key || liveGateway.revoked_at || liveGateway.public_key !== pending.publicKey) {
      safeSend(ws, {
        type: 'ERROR',
        code: 'AUTH_FORBIDDEN',
        message: 'Gateway claim state changed — reconnect',
      });
      return closeAndCleanup();
    }
    if (liveGateway.released_at) {
      safeSend(ws, {
        type: 'ERROR',
        code: 'AUTH_FAILED',
        message: 'Gateway unbound — use provision flow',
      });
      return closeAndCleanup();
    }

    const intended = getZtpIntendedFacilityId(liveGateway.metadata);
    const facilityId = liveGateway.facility_id || intended;
    if (!facilityId || facilityId !== pending.facilityId) {
      safeSend(ws, {
        type: 'ERROR',
        code: 'AUTH_FORBIDDEN',
        message: 'Gateway claim state changed — reconnect',
      });
      return closeAndCleanup();
    }

    const gatewayId = pending.gatewayId;
    const syntheticUser: JWTPayload = {
      userId: `ztp:${gatewayId}`,
      role: UserRole.FACILITY_ADMIN,
      facilityIds: [facilityId],
    };

    const boundGateway = await gatewayModel.findByFacilityId(facilityId);
    let sessionRole: GatewaySessionRole = 'active';
    const now = Date.now();

    const finishZtpAuthOk = async (role: GatewaySessionRole, authedClient: AuthedClient) => {
      const { parseAuthFirmwareVersion, persistAuthFirmwareSeed } = await import(
        '@/utils/gateway-auth-firmware.utils'
      );
      const authFirmwareVersion = parseAuthFirmwareVersion(pending.firmware_version);
      if (authFirmwareVersion) {
        try {
          await persistAuthFirmwareSeed({
            facilityId,
            gatewayId,
            firmwareVersion: authFirmwareVersion,
          });
        } catch (err) {
          logger.warn(
            `Gateway WS ZTP AUTH firmware seed persist failed facility=${facilityId} gateway=${gatewayId}`,
            err,
          );
        }
      }

      if (role === 'active') {
        this.deps.registry.notifyConnectionChange(facilityId, true, 'ztp_auth', now, syntheticUser.userId, remote);
      }
      let ops_public_key_pem: string | undefined;
      try {
        ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem();
      } catch {}
      safeSend(ws, {
        type: 'AUTH_OK',
        facilityId,
        gatewayId,
        sessionRole: role,
        ops_public_key: Ed25519Service.getOpsPublicKeyB64(),
        ops_public_key_jwk: Ed25519Service.getOpsPublicKeyJwk(),
        ops_public_key_pem,
      });
      logger.info(
        `Gateway WS ZTP authenticated: facility=${facilityId} gateway=${gatewayId} role=${role} remote=${remote}`,
      );
      GatewayDebugService.getInstance().publish({
        kind: 'connection_opened',
        facilityId,
        userId: syntheticUser.userId,
        ts: now,
        lastActivityAt: now,
        remote,
      });

      if (role === 'active') {
        import('@/services/firmware/firmware.service')
          .then(({ FirmwareService }) => {
            FirmwareService.resumePendingForFacility(facilityId).catch((err) => {
              logger.warn(`Failed to resume firmware pushes for facility=${facilityId}`, err);
            });
          })
          .catch(() => {});
        import('@/services/gateway/gateway-recovery.service')
          .then(({ GatewayRecoveryService }) => {
            GatewayRecoveryService.resumePendingForFacility(facilityId).catch((err) => {
              logger.warn(`Failed to resume gateway recovery for facility=${facilityId}`, err);
            });
          })
          .catch(() => {});
        this.deps.scheduleActiveSessionCommandFlush(facilityId);
      }
    };

    // Bound production gateway → active
    if (boundGateway && boundGateway.id === gatewayId) {
      const existing = this.deps.registry.getActiveClient(facilityId);
      if (existing && existing.ws !== ws) {
        this.deps.registry.noteAuthReplace(gatewayId);
        try {
          existing.ws.close(4000, 'replaced');
        } catch {}
      }
      const authedClient: AuthedClient = {
        ws,
        user: syntheticUser,
        facilityId,
        gatewayId,
        sessionRole: 'active',
        lastActivityAt: now,
        authViaZtp: true,
      };
      setAuthed(authedClient);
      this.deps.registry.setActiveClient(facilityId, authedClient);
      await finishZtpAuthOk('active', authedClient);
      return;
    }

    // Different bound gateway → swap candidate
    if (boundGateway && boundGateway.id !== gatewayId) {
      const swapCount = this.deps.registry.countSwapCandidatesForFacility(facilityId, gatewayId);
      const limitReject = this.deps.authHelper.checkAutoRegisterLimits(facilityId, gatewayId, swapCount, {
        enforceRateLimit: false,
      });
      if (limitReject) {
        logger.warn(
          `Gateway WS ZTP AUTH rejected (swap candidate) facility=${facilityId} gateway=${gatewayId} code=${limitReject.code}`,
        );
        safeSend(ws, { type: 'ERROR', code: limitReject.code, message: limitReject.message });
        return closeAndCleanup();
      }

      sessionRole = 'swap_candidate';
      const swapKey = `${facilityId}:${gatewayId}`;
      const existingCandidate = this.deps.registry.getSwapCandidate(swapKey);
      if (existingCandidate && existingCandidate.ws !== ws) {
        try {
          existingCandidate.ws.close(4000, 'replaced');
        } catch {}
      }
      const authedClient: AuthedClient = {
        ws,
        user: syntheticUser,
        facilityId,
        gatewayId,
        sessionRole,
        lastActivityAt: now,
        authViaZtp: true,
      };
      setAuthed(authedClient);
      this.deps.registry.setSwapCandidate(swapKey, authedClient);
      try {
        const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
        await GatewayRecoveryService.detect(facilityId, gatewayId, boundGateway.id);
      } catch (err) {
        logger.warn(`Failed to detect gateway swap facility=${facilityId}`, err);
      }
      logger.info(
        `Gateway WS ZTP swap candidate parked: facility=${facilityId} newGateway=${gatewayId} boundGateway=${boundGateway.id}`,
      );
      await finishZtpAuthOk('swap_candidate', authedClient);
      return;
    }

    // No bound gateway — first install race
    if (!liveGateway.facility_id) {
      let result: { bound: boolean; created: boolean };
      try {
        result = await gatewayModel.createOrBindAsFirstGateway({
          id: gatewayId,
          facilityId,
          metadata:
            typeof liveGateway.metadata === 'object' && liveGateway.metadata
              ? liveGateway.metadata
              : undefined,
        });
      } catch (err) {
        logger.error(
          `Gateway WS ZTP AUTH first-bind failed facility=${facilityId} gateway=${gatewayId}`,
          err,
        );
        safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway registration failed' });
        return closeAndCleanup();
      }
      if (result.bound) {
        const existing = this.deps.registry.getActiveClient(facilityId);
        if (existing && existing.ws !== ws) {
          this.deps.registry.noteAuthReplace(gatewayId);
          try {
            existing.ws.close(4000, 'replaced');
          } catch {}
        }
        const authedClient: AuthedClient = {
          ws,
          user: syntheticUser,
          facilityId,
          gatewayId,
          sessionRole: 'active',
          lastActivityAt: now,
          authViaZtp: true,
        };
        setAuthed(authedClient);
        this.deps.registry.setActiveClient(facilityId, authedClient);
        await finishZtpAuthOk('active', authedClient);
        return;
      }
      const winner = await gatewayModel.findByFacilityId(facilityId);
      if (!winner) {
        safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Facility gateway binding conflict' });
        return closeAndCleanup();
      }
      const swapCount = this.deps.registry.countSwapCandidatesForFacility(facilityId, gatewayId);
      const limitReject = this.deps.authHelper.checkAutoRegisterLimits(facilityId, gatewayId, swapCount, {
        enforceRateLimit: false,
      });
      if (limitReject) {
        safeSend(ws, { type: 'ERROR', code: limitReject.code, message: limitReject.message });
        return closeAndCleanup();
      }
      sessionRole = 'swap_candidate';
      const swapKey = `${facilityId}:${gatewayId}`;
      const authedClient: AuthedClient = {
        ws,
        user: syntheticUser,
        facilityId,
        gatewayId,
        sessionRole,
        lastActivityAt: now,
        authViaZtp: true,
      };
      setAuthed(authedClient);
      this.deps.registry.setSwapCandidate(swapKey, authedClient);
      try {
        const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
        await GatewayRecoveryService.detect(facilityId, gatewayId, winner.id);
      } catch (err) {
        logger.warn(`Failed to detect gateway swap facility=${facilityId}`, err);
      }
      await finishZtpAuthOk('swap_candidate', authedClient);
      return;
    }

    // Fallback: bound row but findByFacilityId missed → treat as active
    const existing = this.deps.registry.getActiveClient(facilityId);
    if (existing && existing.ws !== ws) {
      this.deps.registry.noteAuthReplace(gatewayId);
      try {
        existing.ws.close(4000, 'replaced');
      } catch {}
    }
    const authedClient: AuthedClient = {
      ws,
      user: syntheticUser,
      facilityId,
      gatewayId,
      sessionRole: 'active',
      lastActivityAt: now,
      authViaZtp: true,
    };
    setAuthed(authedClient);
    this.deps.registry.setActiveClient(facilityId, authedClient);
    await finishZtpAuthOk('active', authedClient);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JWT AUTH handler
  // ─────────────────────────────────────────────────────────────────────────

  private async handleJwtAuth(ctx: MessageDispatchContext, msg: any): Promise<void> {
    const { ws, setAuthed, closeAndCleanup } = ctx;
    const remote = getRemoteAddress(ws);
    const token = String(msg?.token || '');
    const facilityId = String(msg?.facilityId || '');
    const decoded = AuthService.verifyToken(token) as JWTPayload | null;
    if (!decoded) {
      logger.warn(`Gateway WS AUTH failed (invalid token) remote=${remote} requestedFacility=${facilityId}`);
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Invalid token' });
      return closeAndCleanup();
    }
    {
      const { UserModel } = await import('@/models/user.model');
      const dbUser = (await UserModel.findById(decoded.userId)) as
        | import('@/models/user.model').User
        | undefined;
      if (!dbUser) {
        logger.warn(`Gateway WS AUTH failed (user missing) user=${decoded.userId} remote=${remote}`);
        safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Invalid token' });
        return closeAndCleanup();
      }
      const denial = AuthService.getSessionDenialReason(dbUser);
      if (denial) {
        logger.warn(`Gateway WS AUTH failed (${denial}) user=${decoded.userId} remote=${remote}`);
        safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: denial });
        return closeAndCleanup();
      }
    }
    if (![UserRole.FACILITY_ADMIN, UserRole.ADMIN, UserRole.DEV_ADMIN].includes(decoded.role)) {
      logger.warn(`Gateway WS AUTH forbidden (role=${decoded.role}) user=${decoded.userId} remote=${remote} facility=${facilityId}`);
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Insufficient role' });
      return closeAndCleanup();
    }
    if (!facilityId) {
      logger.warn(`Gateway WS AUTH bad request (missing facilityId) user=${decoded.userId} role=${decoded.role} remote=${remote}`);
      safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'facilityId required' });
      return closeAndCleanup();
    }
    if (decoded.role === UserRole.FACILITY_ADMIN) {
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      const hasAccess = await FacilityAccessService.hasAccessToFacility(
        decoded.userId,
        decoded.role as UserRole,
        facilityId
      );
      if (!hasAccess) {
        logger.warn(`Gateway WS AUTH forbidden (facility not permitted) user=${decoded.userId} role=${decoded.role} remote=${remote} facility=${facilityId}`);
        safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Facility not permitted' });
        return closeAndCleanup();
      }
    }
    const gatewayId = typeof msg?.gatewayId === 'string' && msg.gatewayId.length > 0
      ? String(msg.gatewayId)
      : undefined;

    if (!gatewayId) {
      logger.warn(`Gateway WS AUTH bad request (missing gatewayId) user=${decoded.userId} remote=${remote} facility=${facilityId}`);
      safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'gatewayId required' });
      return closeAndCleanup();
    }
    if (!isValidGatewayUuid(gatewayId)) {
      logger.warn(`Gateway WS AUTH bad request (invalid gatewayId) user=${decoded.userId} remote=${remote} facility=${facilityId} gateway=${gatewayId}`);
      safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'gatewayId must be a valid UUID' });
      return closeAndCleanup();
    }

    const { GatewayModel } = await import('@/models/gateway.model');
    const gatewayModel = new GatewayModel();
    // ZTP-claimed devices must use ECDSA AUTH
    {
      const ztpRow = await gatewayModel.findById(gatewayId);
      if (ztpRow?.public_key && !ztpRow.revoked_at) {
        logger.warn(
          `Gateway WS AUTH rejected (ZTP device requires ECDSA) gateway=${gatewayId} facility=${facilityId}`,
        );
        safeSend(ws, {
          type: 'ERROR',
          code: 'AUTH_FORBIDDEN',
          message: 'ZTP gateway must authenticate with AUTH_HELLO / AUTH_PROOF',
        });
        return closeAndCleanup();
      }
      if (ztpRow?.revoked_at) {
        safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Gateway revoked' });
        return closeAndCleanup();
      }
    }

    const boundGateway = await gatewayModel.findByFacilityId(facilityId);

    let sessionRole: GatewaySessionRole = 'active';
    let resolvedGatewayId = gatewayId;
    let autoRegistered = false;
    let authed: AuthedClient | null = null;

    const setActiveSession = (gid: string, role: GatewaySessionRole) => {
      const existing = this.deps.registry.getActiveClient(facilityId);
      if (existing && existing.ws !== ws && (existing.gatewayId === gid || existing.sessionRole === 'active')) {
        this.deps.registry.noteAuthReplace(gid);
        try { existing.ws.close(4000, 'replaced'); } catch {}
      }
      const now = Date.now();
      authed = { ws, user: decoded, facilityId, gatewayId: gid, sessionRole: role, lastActivityAt: now };
      this.deps.registry.setActiveClient(facilityId, authed);
    };

    const parkSwapCandidate = async (gid: string, boundId: string): Promise<boolean> => {
      sessionRole = 'swap_candidate';
      resolvedGatewayId = gid;
      const swapKey = `${facilityId}:${gid}`;
      const existingCandidate = this.deps.registry.getSwapCandidate(swapKey);
      if (existingCandidate && existingCandidate.ws !== ws) {
        try { existingCandidate.ws.close(4000, 'replaced'); } catch {}
      }
      const now = Date.now();
      authed = { ws, user: decoded, facilityId, gatewayId: gid, sessionRole, lastActivityAt: now };
      this.deps.registry.setSwapCandidate(swapKey, authed);
      try {
        const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
        await GatewayRecoveryService.detect(facilityId, gid, boundId);
      } catch (err) {
        logger.warn(`Failed to detect gateway swap facility=${facilityId}`, err);
      }
      logger.info(`Gateway WS swap candidate parked: facility=${facilityId} newGateway=${gid} boundGateway=${boundId}`);
      return true;
    };

    try {
      if (boundGateway && gatewayId === boundGateway.id) {
        sessionRole = 'active';
        setActiveSession(gatewayId, 'active');
      } else if (boundGateway) {
        const swapCount = this.deps.registry.countSwapCandidatesForFacility(facilityId, gatewayId);
        const ensured = await this.deps.authHelper.ensureUnboundSwapCandidateRecord(
          gatewayModel,
          gatewayId,
          facilityId,
          decoded.userId,
          swapCount,
          {},
        );
        if (!ensured.ok) {
          logger.warn(
            `Gateway WS AUTH rejected (swap candidate) facility=${facilityId} gateway=${gatewayId} code=${ensured.reject.code}`,
          );
          safeSend(ws, { type: 'ERROR', code: ensured.reject.code, message: ensured.reject.message });
          return closeAndCleanup();
        }
        if (ensured.created) {
          autoRegistered = true;
        }
        if (!(await parkSwapCandidate(gatewayId, boundGateway.id))) {
          return;
        }
      } else {
        if (config.gatewayZtpRequired) {
          logger.warn(
            `Gateway WS AUTH rejected (GATEWAY_ZTP_REQUIRED) first-install JWT bind facility=${facilityId} gateway=${gatewayId}`,
          );
          safeSend(ws, {
            type: 'ERROR',
            code: 'AUTH_FORBIDDEN',
            message: 'ZTP claim required for new gateway bind',
          });
          return closeAndCleanup();
        }
        const existingGateway = await gatewayModel.findById(gatewayId);
        if (existingGateway?.facility_id && existingGateway.facility_id !== facilityId) {
          logger.warn(
            `Gateway WS AUTH rejected (gateway bound to another facility) gateway=${gatewayId} facility=${facilityId} boundTo=${existingGateway.facility_id}`,
          );
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Gateway belongs to another facility' });
          return closeAndCleanup();
        }
        if (!existingGateway) {
          const swapCount = this.deps.registry.countSwapCandidatesForFacility(facilityId, gatewayId);
          const limitReject = this.deps.authHelper.checkAutoRegisterLimits(facilityId, gatewayId, swapCount, {
            enforceCandidateCap: false,
          });
          if (limitReject) {
            logger.warn(
              `Gateway WS AUTH rejected (first-install auto-register) facility=${facilityId} gateway=${gatewayId} code=${limitReject.code}`,
            );
            safeSend(ws, { type: 'ERROR', code: limitReject.code, message: limitReject.message });
            return closeAndCleanup();
          }
        }
        const result = await gatewayModel.createOrBindAsFirstGateway({
          id: gatewayId,
          facilityId,
          metadata: { autoRegistered: true },
        });
        if (result.bound) {
          sessionRole = 'active';
          setActiveSession(gatewayId, 'active');
          if (result.created) {
            autoRegistered = true;
            await this.deps.authHelper.logAutoRegistration({ facilityId, gatewayId, bound: true, userId: decoded.userId });
            logger.info(`Gateway WS auto-registered + bound first gateway facility=${facilityId} gateway=${gatewayId}`);
          }
        } else {
          const winner = await gatewayModel.findByFacilityId(facilityId);
          if (!winner) {
            logger.error(
              `Gateway WS AUTH first-install race without bound winner facility=${facilityId} gateway=${gatewayId}`,
            );
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Facility gateway binding conflict' });
            return closeAndCleanup();
          }
          const swapCount = this.deps.registry.countSwapCandidatesForFacility(facilityId, gatewayId);
          const ensured = await this.deps.authHelper.ensureUnboundSwapCandidateRecord(
            gatewayModel,
            gatewayId,
            facilityId,
            decoded.userId,
            swapCount,
            { enforceRateLimit: false },
          );
          if (!ensured.ok) {
            logger.warn(
              `Gateway WS AUTH rejected (first-install race fallback) facility=${facilityId} gateway=${gatewayId} code=${ensured.reject.code}`,
            );
            safeSend(ws, { type: 'ERROR', code: ensured.reject.code, message: ensured.reject.message });
            return closeAndCleanup();
          }
          if (ensured.created) {
            autoRegistered = true;
          }
          if (!(await parkSwapCandidate(gatewayId, winner.id))) {
            return;
          }
        }
      }
    } catch (err) {
      logger.error(`Gateway WS AUTH auto-register failed facility=${facilityId} gateway=${gatewayId}`, err);
      safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway registration failed' });
      return closeAndCleanup();
    }

    // Nested helpers assign `authed`; TS does not narrow across those closures.
    const sessionClient = authed as AuthedClient | null;
    if (!sessionClient) {
      return;
    }

    setAuthed(sessionClient);

    const { parseAuthFirmwareVersion, persistAuthFirmwareSeed } = await import(
      '@/utils/gateway-auth-firmware.utils'
    );
    const authFirmwareVersion = parseAuthFirmwareVersion(msg?.firmware_version);
    if (authFirmwareVersion) {
      try {
        await persistAuthFirmwareSeed({
          facilityId,
          gatewayId: resolvedGatewayId,
          firmwareVersion: authFirmwareVersion,
        });
      } catch (err) {
        logger.warn(
          `Gateway WS AUTH firmware seed persist failed facility=${facilityId} gateway=${resolvedGatewayId}`,
          err,
        );
      }
    }

    if (sessionRole === 'active') {
      this.deps.registry.notifyConnectionChange(
        facilityId,
        true,
        'auth_ok',
        sessionClient.lastActivityAt,
        decoded.userId,
        remote,
      );
    }
    let ops_public_key_pem: string | undefined;
    try { ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem(); } catch {}
    safeSend(ws, {
      type: 'AUTH_OK',
      facilityId,
      gatewayId: resolvedGatewayId,
      sessionRole,
      autoRegistered,
      ops_public_key: Ed25519Service.getOpsPublicKeyB64(),
      ops_public_key_jwk: Ed25519Service.getOpsPublicKeyJwk(),
      ops_public_key_pem,
    });
    logger.info(`Gateway WS authenticated: facility=${facilityId} gateway=${resolvedGatewayId} role=${sessionRole} user=${decoded.userId} remote=${remote}`);
    GatewayDebugService.getInstance().publish({
      kind: 'connection_opened',
      facilityId,
      userId: decoded.userId,
      ts: sessionClient.lastActivityAt,
      lastActivityAt: sessionClient.lastActivityAt,
      remote,
    });
    import('@/services/firmware/firmware.service').then(({ FirmwareService }) => {
      FirmwareService.resumePendingForFacility(facilityId).catch((err) => {
        logger.warn(`Failed to resume firmware pushes for facility=${facilityId}`, err);
      });
    }).catch(() => {});
    import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
      GatewayRecoveryService.resumePendingForFacility(facilityId).catch((err) => {
        logger.warn(`Failed to resume gateway recovery for facility=${facilityId}`, err);
      });
    }).catch(() => {});
    if (sessionRole === 'active') {
      this.deps.scheduleActiveSessionCommandFlush(facilityId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROXY_REQUEST handler
  // ─────────────────────────────────────────────────────────────────────────

  private async handleProxyRequest(ctx: MessageDispatchContext, msg: any, authed: AuthedClient): Promise<void> {
    const { ws } = ctx;
    const id = String(msg?.id || '');
    const method = String(msg?.method || 'GET').toUpperCase();
    const path = String(msg?.path || '/');
    const headers = (msg?.headers || {}) as Record<string, string>;
    const query = msg?.query || undefined;
    const body = msg?.body || undefined;
    const tid = extractTid(body);
    try {
      const response = await this.deps.apiProxy.proxyRequest({
        user: { userId: authed.user.userId, role: authed.user.role, facilityIds: authed.user.facilityIds, email: authed.user.email },
        connectionFacilityId: authed.facilityId,
        gatewayId: authed.gatewayId,
        sessionRole: authed.sessionRole,
        method,
        path,
        headers,
        query,
        body,
      });
      const responseBody = mergeTidIntoResponse(response.data, tid);
      safeSend(ws, { type: 'PROXY_RESPONSE', id, status: response.status, headers: response.headers, body: responseBody });
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const data = e?.response?.data || { error: 'Proxy failed' };
      const errorBody = mergeTidIntoResponse(data, tid);
      logger.warn(
        `Gateway WS proxy error facility=${authed.facilityId} user=${authed.user.userId} method=${method} path=${path} status=${status} message=${e?.message || 'unknown'} details=${JSON.stringify(e?.response?.data || {})}`,
      );
      safeSend(ws, { type: 'PROXY_RESPONSE', id, status, body: errorBody });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Firmware message handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async handleFirmwareMessage(
    ctx: MessageDispatchContext,
    msg: any,
    authed: AuthedClient,
    type: string,
  ): Promise<void> {
    const { ws } = ctx;
    const recoveryInbound = this.deps.registry.validateRecoveryInboundSession(authed.facilityId, authed.gatewayId, authed.sessionRole);
    if (!recoveryInbound.accepted) {
      logger.warn(`Gateway WS firmware message rejected facility=${authed.facilityId} reason=${recoveryInbound.reason}`);
      if (type === 'FIRMWARE_UPDATE_STATUS') {
        safeSend(ws, {
          type: 'FIRMWARE_UPDATE_STATUS_ACK',
          push_id: typeof msg?.push_id === 'string' ? msg.push_id : msg?.pushId,
          accepted: false,
          reason: recoveryInbound.reason,
        });
      }
      return;
    }
    try {
      const { FirmwareService } = await import('@/services/firmware/firmware.service');
      if (type === 'FIRMWARE_CHUNK_ACK') {
        await FirmwareService.handleChunkAck(authed.facilityId, msg);
      } else if (type === 'FIRMWARE_UPDATE_STATUS') {
        const result = await FirmwareService.handleUpdateStatus(authed.facilityId, msg);
        const ackPushId = result.push_id
          ?? (typeof msg?.push_id === 'string' ? msg.push_id : (typeof msg?.pushId === 'string' ? msg.pushId : undefined));
        safeSend(ws, {
          type: 'FIRMWARE_UPDATE_STATUS_ACK',
          push_id: ackPushId,
          accepted: result.accepted,
          push_status: result.push_status,
          reason: result.reason,
        });
      } else {
        await FirmwareService.handleProgress(authed.facilityId, msg);
      }
    } catch (err) {
      logger.warn(`Gateway WS firmware message handling error type=${type} facility=${authed.facilityId}`, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Inventory snapshot message handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async handleInventorySnapshotMessage(
    ctx: MessageDispatchContext,
    msg: any,
    authed: AuthedClient,
    type: string,
  ): Promise<void> {
    const { ws } = ctx;
    const recoveryInbound = this.deps.registry.validateRecoveryInboundSession(authed.facilityId, authed.gatewayId, authed.sessionRole);
    if (!recoveryInbound.accepted) {
      logger.warn(`Gateway WS inventory snapshot message rejected facility=${authed.facilityId} reason=${recoveryInbound.reason}`);
      if (type === 'INVENTORY_SNAPSHOT_STATUS') {
        safeSend(ws, {
          type: 'INVENTORY_SNAPSHOT_STATUS_ACK',
          recovery_id: typeof msg?.recovery_id === 'string' ? msg.recovery_id : msg?.recoveryId,
          accepted: false,
          reason: recoveryInbound.reason,
        });
      }
      return;
    }
    try {
      const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
      if (type === 'INVENTORY_SNAPSHOT_CHUNK_ACK') {
        await GatewayRecoveryService.handleChunkAck(authed.facilityId, msg);
      } else {
        const result = await GatewayRecoveryService.handleSnapshotStatus(authed.facilityId, msg);
        const ackRecoveryId = result.recovery_id
          ?? (typeof msg?.recovery_id === 'string' ? msg.recovery_id : (typeof msg?.recoveryId === 'string' ? msg.recoveryId : undefined));
        safeSend(ws, {
          type: 'INVENTORY_SNAPSHOT_STATUS_ACK',
          recovery_id: ackRecoveryId,
          accepted: result.accepted,
          recovery_status: result.recovery_status,
          reason: result.reason,
        });
      }
    } catch (err) {
      logger.warn(`Gateway WS inventory snapshot message handling error type=${type} facility=${authed.facilityId}`, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS_CODE_UPDATE_ACK handler
  // ─────────────────────────────────────────────────────────────────────────

  private async handleAccessCodeUpdateAck(authed: AuthedClient, msg: any): Promise<void> {
    try {
      const { AccessCodeService } = await import('@/services/access-code.service');
      AccessCodeService.getInstance().handleGatewayAccessCodeUpdateAck(authed.facilityId, msg);
    } catch (err) {
      logger.warn(`Gateway WS ACCESS_CODE_UPDATE_ACK handling error facility=${authed.facilityId}`, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEVICE_DELETED_ACK handler
  // ─────────────────────────────────────────────────────────────────────────

  private async handleDeviceDeletedAck(authed: AuthedClient, msg: any): Promise<void> {
    try {
      const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
      DeviceDeletionOutboxService.getInstance().handleDeviceDeletedAck(authed.facilityId, msg);
    } catch (err) {
      logger.warn(`Gateway WS DEVICE_DELETED_ACK handling error facility=${authed.facilityId}`, err);
    }
  }
}
