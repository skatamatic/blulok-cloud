import { Server as HTTPServer } from 'http';
import { logger } from '@/utils/logger';
import { GatewayTransport } from './gateway-transport.interface';
import { WebsocketGatewayTransport } from './websocket-gateway.transport';
import { GatewayModel } from '@/models/gateway.model';
import { notifyGatewayStatusAfterDbUpdate } from '@/utils/gateway-status-notification.util';
import { WebSocketService } from '@/services/websocket.service';
import { GatewayTelemetryLogService } from '@/services/gateway-telemetry-log.service';
import { formatGatewayDisconnectReason } from '@/utils/gateway-telemetry-system-log.utils';
import {
  DEFAULT_GATEWAY_OFFLINE_GRACE_MS,
  GATEWAY_OFFLINE_GRACE_OVERRIDE_MAX_MS,
  GATEWAY_OFFLINE_GRACE_OVERRIDE_MIN_MS,
} from '@/constants/gateway-liveness.constants';
import { GatewayRecoveryService } from '@/services/gateway/gateway-recovery.service';
import {
  isOperationalOutboundBlockedDuringRecovery,
  summarizeOutboundPayload,
} from '@/utils/gateway-recovery-outbound.utils';
import { inboundLastSeenShowsReconnectAfterDisconnect } from '@/utils/gateway-offline-confirm.utils';

type PendingOfflineEntry = {
  timer: NodeJS.Timeout;
  gatewayId: string;
  gatewayName: string;
  previousStatus: string;
  disconnectedAtMs: number;
  reason?: string;
};

/**
 * Gateway Client Information Interface
 *
 * Represents an authenticated gateway WebSocket connection with facility scoping.
 */
// Internal no-op transport for tests or disabled mode
class NoopTransport implements GatewayTransport {
  initialize(_server: HTTPServer): void { /* noop */ }
  broadcast(_payload: any): void { /* noop */ }
  unicastToFacility(_facilityId: string, _payload: any): void { /* noop */ }
  shutdown(): void { /* noop */ }
}

/**
 * Gateway Events Service
 *
 * WebSocket service providing real-time communication channel between BluLok cloud
 * and on-site facility gateways. Enables secure command delivery and status updates.
 *
 * Key Features:
 * - JWT-authenticated WebSocket connections at `/ws/gateway`
 * - Facility-scoped access control for multi-tenant isolation
 * - Unicast messaging to specific facility gateways
 * - Broadcast messaging to all connected gateways
 * - Automatic connection management and cleanup
 *
 * Authentication & Authorization:
 * - After upgrade, client must send JSON { type: 'AUTH', token, facilityId }
 * - Restricted to FACILITY_ADMIN, ADMIN, and DEV_ADMIN roles
 * - Facility-scoped permissions prevent cross-tenant access
 * - Token validation on connection establishment
 *
 * Message Types:
 * - Unicast: Targeted commands to specific facility gateways
 * - Broadcast: System-wide commands (time sync, key rotation)
 * - Acknowledgment: Gateway responses to received commands
 *
 * Security Considerations:
 * - Encrypted WebSocket connections (WSS in production)
 * - JWT token validation prevents unauthorized access
 * - Facility scoping prevents command leakage
 * - Connection monitoring and automatic cleanup
 * - Audit logging for all gateway communications
 */
export class GatewayEventsService {
  private static instance: GatewayEventsService;
  private transport: GatewayTransport;
  private readonly gatewayModel = new GatewayModel();
  private unbindTransportConnectionListener?: () => void;
  private pendingOfflineByFacility = new Map<string, PendingOfflineEntry>();
  /** Dev/e2e override for offline grace; `null` uses {@link DEFAULT_GATEWAY_OFFLINE_GRACE_MS}. */
  private offlineGraceMsOverride: number | null = null;
  private connectionListeners = new Set<(event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
    userId?: string;
    remoteAddress?: string;
  }) => void>();

  public static getInstance(): GatewayEventsService {
    if (!this.instance) this.instance = new GatewayEventsService();
    return this.instance;
  }

  private constructor() {
    // Default to WebSocket transport; tests may replace with mocks or Noop
    this.transport = new WebsocketGatewayTransport();
    this.bindTransportConnectionListener();
  }

  // Allow tests/bootstrappers to override transport if needed
  public setTransport(transport: GatewayTransport): void {
    this.transport = transport || new NoopTransport();
    this.bindTransportConnectionListener();
  }

  private bindTransportConnectionListener(): void {
    if (this.unbindTransportConnectionListener) {
      this.unbindTransportConnectionListener();
      this.unbindTransportConnectionListener = undefined;
    }

    const maybeTransport = this.transport as any;
    if (typeof maybeTransport.setConnectionChangeListener === 'function') {
      const unbind = maybeTransport.setConnectionChangeListener((event: {
        facilityId: string;
        connected: boolean;
        timestamp: number;
        reason?: string;
        lastActivityAt?: number;
        userId?: string;
        remoteAddress?: string;
      }) => {
        void this.syncGatewayDbWithInboundConnection(event);
        this.connectionListeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            logger.warn('Gateway connection listener callback failed', error);
          }
        });
      });
      if (typeof unbind === 'function') {
        this.unbindTransportConnectionListener = unbind;
      }
    }
  }

  public initialize(server: HTTPServer): void {
    try {
      this.transport.initialize(server);
      logger.info('GatewayEventsService transport initialized');
    } catch (e) {
      logger.error('Failed to initialize GatewayEventsService transport:', e);
    }
  }

  public broadcast(payload: any): void {
    this.transport.broadcast(payload);
  }

  public unicastToFacility(facilityId: string, payload: any): void {
    if (
      GatewayRecoveryService.isBlockingActiveForFacilitySync(facilityId)
      && isOperationalOutboundBlockedDuringRecovery(payload)
    ) {
      const summary = summarizeOutboundPayload(payload);
      logger.warn(
        `GatewayEventsService.unicastToFacility blocked during recovery facility=${facilityId} summary=${JSON.stringify(summary)}`,
      );
      return;
    }

    try {
      const summary = summarizeOutboundPayload(payload);
      logger.info(`GatewayEventsService.unicastToFacility facility=${facilityId} summary=${JSON.stringify(summary)}`);
    } catch {}
    this.transport.unicastToFacility(facilityId, payload);
  }

  /** Force-close the active inbound gateway WS for a facility (release/revoke). */
  public forceDisconnectFacility(facilityId: string, reason = 'force_disconnect'): void {
    const t: any = this.transport as any;
    if (t && typeof t.forceDisconnectFacility === 'function') {
      t.forceDisconnectFacility(facilityId, reason);
    }
  }

  /** Force-close active or swap-candidate WS for a specific gateway id. */
  public forceDisconnectGatewayById(gatewayId: string, reason = 'force_disconnect'): void {
    const t: any = this.transport as any;
    if (t && typeof t.forceDisconnectGatewayById === 'function') {
      t.forceDisconnectGatewayById(gatewayId, reason);
    }
  }

  /**
   * Raw transport socket status — use for command delivery, firmware, outbox flush.
   * Does **not** include offline grace; a Cloud Run recycle reports `connected: false`
   * until AUTH completes again.
   */
  public getFacilityConnectionStatus(facilityId: string): { connected: boolean; lastPongAt?: number } {
    const t: any = this.transport as any;
    if (t && typeof t.getConnectionStatusForFacility === 'function') {
      return t.getConnectionStatusForFacility(facilityId);
    }
    if (t && t['facilityToClient'] && typeof t['facilityToClient'].get === 'function') {
      const client = t['facilityToClient'].get(facilityId);
      if (client) {
        const lastPongAt = client.lastPongAt ?? client.lastActivityAt ?? undefined;
        return { connected: true, lastPongAt };
      }
    }
    return { connected: false };
  }

  /** True while a disconnect is waiting on offline grace before persisting offline. */
  public isFacilityPendingOffline(facilityId: string): boolean {
    return this.pendingOfflineByFacility.has(facilityId);
  }

  /**
   * Product-facing liveness for UI pills, device reachability, and status broadcasts.
   * Stays `connected: true` while a pending-offline grace timer is active so brief
   * Cloud Run / proxy recycles do not flap gateway or device offline state.
   */
  public getFacilityProductLiveness(facilityId: string): { connected: boolean; lastPongAt?: number } {
    const transport = this.getFacilityConnectionStatus(facilityId);
    if (transport.connected) {
      return transport;
    }
    if (this.pendingOfflineByFacility.has(facilityId)) {
      return { connected: true, lastPongAt: transport.lastPongAt };
    }
    return transport;
  }

  /** Effective offline grace (runtime override or env/default). */
  public getOfflineGraceMs(): number {
    return this.offlineGraceMsOverride ?? DEFAULT_GATEWAY_OFFLINE_GRACE_MS;
  }

  public isOfflineGraceOverrideActive(): boolean {
    return this.offlineGraceMsOverride !== null;
  }

  /**
   * Dev/e2e: temporarily override offline grace for this process.
   * Pass `null` to restore the env/default value.
   */
  public setOfflineGraceMsOverride(ms: number | null): number {
    if (ms === null) {
      this.offlineGraceMsOverride = null;
      logger.info(
        `Gateway offline grace override cleared (default=${DEFAULT_GATEWAY_OFFLINE_GRACE_MS}ms)`,
      );
      return this.getOfflineGraceMs();
    }

    if (!Number.isFinite(ms)) {
      throw new Error('grace_ms must be a finite number or null');
    }
    const rounded = Math.floor(ms);
    if (
      rounded < GATEWAY_OFFLINE_GRACE_OVERRIDE_MIN_MS
      || rounded > GATEWAY_OFFLINE_GRACE_OVERRIDE_MAX_MS
    ) {
      throw new Error(
        `grace_ms must be between ${GATEWAY_OFFLINE_GRACE_OVERRIDE_MIN_MS} and ${GATEWAY_OFFLINE_GRACE_OVERRIDE_MAX_MS}`,
      );
    }

    this.offlineGraceMsOverride = rounded;
    logger.info(`Gateway offline grace override set to ${rounded}ms (default=${DEFAULT_GATEWAY_OFFLINE_GRACE_MS}ms)`);
    return rounded;
  }

  public getTransport(): GatewayTransport {
    return this.transport;
  }

  public getConnectedFacilityIds(): string[] {
    const maybeTransport = this.transport as any;
    if (typeof maybeTransport.getConnectedFacilityIds === 'function') {
      return maybeTransport.getConnectedFacilityIds() as string[];
    }
    return [];
  }

  public onFacilityConnectionChange(listener: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
    userId?: string;
    remoteAddress?: string;
  }) => void): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  /**
   * Shutdown the gateway events service and cleanup resources.
   * Stops heartbeat timers and closes all connections.
   */
  public shutdown(): void {
    this.clearAllPendingOffline();
    if (this.unbindTransportConnectionListener) {
      this.unbindTransportConnectionListener();
      this.unbindTransportConnectionListener = undefined;
    }
    if (this.transport && typeof this.transport.shutdown === 'function') {
      this.transport.shutdown();
    }
  }

  /**
   * Keep `gateways.status` aligned with inbound `/ws/gateway` sessions for mesh/physical gateways.
   * HTTP gateways use outbound polling to report liveness; do not overwrite their DB status from inbound WS.
   */
  private recordInboundWsTelemetryLog(
    gatewayId: string,
    facilityId: string,
    event: {
      connected: boolean;
      reason?: string;
      lastActivityAt?: number;
      userId?: string;
      remoteAddress?: string;
    },
  ): void {
    const telemetry = GatewayTelemetryLogService.getInstance();
    if (event.connected) {
      telemetry.recordSystemEventSafe({
        event: 'gateway_connected',
        message: 'Gateway inbound WebSocket connected (cloud system)',
        facility_id: facilityId,
        gateway_id: gatewayId,
        reason: event.reason ?? 'auth_ok',
        user_id: event.userId,
        remote_address: event.remoteAddress,
      });
      return;
    }

    const reasonLabel = formatGatewayDisconnectReason(event.reason);
    telemetry.recordSystemEventSafe({
      event: 'gateway_disconnected',
      message: `Gateway inbound WebSocket disconnected: ${reasonLabel} (cloud system)`,
      facility_id: facilityId,
      gateway_id: gatewayId,
      reason: event.reason,
      user_id: event.userId,
      remote_address: event.remoteAddress,
      last_activity_at: event.lastActivityAt,
    });
  }

  private clearPendingOffline(facilityId: string): void {
    const pending = this.pendingOfflineByFacility.get(facilityId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingOfflineByFacility.delete(facilityId);
  }

  private clearAllPendingOffline(): void {
    for (const pending of this.pendingOfflineByFacility.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingOfflineByFacility.clear();
  }

  private schedulePendingOffline(
    facilityId: string,
    gateway: { id: string; name: string; status: string },
    reason?: string,
  ): void {
    if (this.pendingOfflineByFacility.has(facilityId)) {
      return;
    }

    const disconnectedAtMs = Date.now();
    const timer = setTimeout(() => {
      this.pendingOfflineByFacility.delete(facilityId);
      void this.applyPendingGatewayOffline(facilityId, disconnectedAtMs);
    }, this.getOfflineGraceMs());
    timer.unref?.();

    this.pendingOfflineByFacility.set(facilityId, {
      timer,
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      previousStatus: gateway.status,
      disconnectedAtMs,
      reason,
    });
  }

  private async applyPendingGatewayOffline(
    facilityId: string,
    disconnectedAtMs: number,
  ): Promise<void> {
    if (this.getFacilityConnectionStatus(facilityId).connected) {
      return;
    }

    try {
      const gw = await this.gatewayModel.findByFacilityId(facilityId);
      if (!gw) return;

      if (inboundLastSeenShowsReconnectAfterDisconnect(gw.last_seen, disconnectedAtMs)) {
        logger.info(
          `applyPendingGatewayOffline skipped facility=${facilityId} gateway=${gw.id} ` +
            `last_seen=${gw.last_seen ? new Date(gw.last_seen).toISOString() : 'null'} ` +
            `disconnectedAt=${new Date(disconnectedAtMs).toISOString()}`,
        );
        return;
      }

      const previousStatus = gw.status;
      if (previousStatus === 'offline') {
        const wsService = WebSocketService.getInstance();
        await wsService.broadcastGatewayStatusUpdate(facilityId, gw.id);
        void wsService.broadcastFacilityDeviceReachabilityRefresh(facilityId);
        import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
          GatewayRecoveryService.scheduleStatusBroadcast(facilityId);
        }).catch(() => {});
        return;
      }

      await this.gatewayModel.updateStatus(gw.id, 'offline');

      void notifyGatewayStatusAfterDbUpdate({
        facilityId,
        gatewayId: gw.id,
        gatewayName: gw.name,
        previousStatus,
        nextStatus: 'offline',
      });

      const wsService = WebSocketService.getInstance();
      await wsService.broadcastGatewayStatusUpdate(facilityId, gw.id);
      void wsService.broadcastFacilityDeviceReachabilityRefresh(facilityId);
    } catch (error) {
      logger.warn(`applyPendingGatewayOffline failed facility=${facilityId}`, error);
    }
  }

  private async syncGatewayDbWithInboundConnection(event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
    userId?: string;
    remoteAddress?: string;
  }): Promise<void> {
    const { facilityId, connected } = event;
    try {
      const gw = await this.gatewayModel.findByFacilityId(facilityId);
      if (!gw) {
        // No gateway record for this facility. The live session is still reported via
        // getFacilityConnectionStatus() and the broadcast payload enrichment, but there is
        // no row to persist against.
        return;
      }

      // Always record cloud-system telemetry for inbound /ws/gateway sessions.
      this.recordInboundWsTelemetryLog(gw.id, facilityId, event);

      if (connected) {
        this.clearPendingOffline(facilityId);

        const previousStatus = gw.status;
        await this.gatewayModel.updateStatusAndLastSeen(gw.id, 'online');

        if (previousStatus !== 'online') {
          void notifyGatewayStatusAfterDbUpdate({
            facilityId,
            gatewayId: gw.id,
            gatewayName: gw.name,
            previousStatus,
            nextStatus: 'online',
            reason: event.reason,
          });
        }

        const wsService = WebSocketService.getInstance();
        await wsService.broadcastGatewayStatusUpdate(facilityId, gw.id);
        void wsService.broadcastFacilityDeviceReachabilityRefresh(facilityId);
        import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
          GatewayRecoveryService.scheduleStatusBroadcast(facilityId);
        }).catch(() => {});
        return;
      }

      // Transient disconnect: wait for reconnect before persisting offline + alerting.
      this.schedulePendingOffline(facilityId, gw, event.reason);

      const wsService = WebSocketService.getInstance();
      await wsService.broadcastGatewayStatusUpdate(facilityId, gw.id);
      void wsService.broadcastFacilityDeviceReachabilityRefresh(facilityId);
      import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
        GatewayRecoveryService.scheduleStatusBroadcast(facilityId);
      }).catch(() => {});
    } catch (error) {
      logger.warn(`syncGatewayDbWithInboundConnection failed facility=${facilityId}`, error);
    }
  }
}


