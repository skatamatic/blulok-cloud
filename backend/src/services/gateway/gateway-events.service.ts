import { Server as HTTPServer } from 'http';
import { logger } from '@/utils/logger';
import { GatewayTransport } from './gateway-transport.interface';
import { WebsocketGatewayTransport } from './websocket-gateway.transport';
import { GatewayModel } from '@/models/gateway.model';
import { notifyGatewayStatusAfterDbUpdate } from '@/utils/gateway-status-notification.util';
import { WebSocketService } from '@/services/websocket.service';
import { GatewayTelemetryLogService } from '@/services/gateway-telemetry-log.service';
import { formatGatewayDisconnectReason } from '@/utils/gateway-telemetry-system-log.utils';

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
    try {
      // Log a concise summary to help debugging command delivery
      const summary = (() => {
        // Handle JWT strings by parsing the payload
        if (typeof payload === 'string' && payload.includes('.')) {
          try {
            const parts = payload.split('.');
            if (parts.length === 3) {
              const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
              const type = decoded?.cmd_type || 'JWT';
              const targets = decoded?.target?.length ?? undefined;
              return { type, targets, format: 'JWT' };
            }
          } catch { /* ignore parse errors */ }
          return { type: 'JWT_STRING', format: 'JWT' };
        }
        // Handle legacy object/array payloads (for backward compatibility)
        const p = Array.isArray(payload) ? payload[0] : payload;
        const type = p?.cmd_type || p?.type || typeof p;
        const targets = p?.target?.length ?? p?.targets?.device_ids?.length ?? undefined;
        return { type, targets };
      })();
      logger.info(`GatewayEventsService.unicastToFacility facility=${facilityId} summary=${JSON.stringify(summary)}`);
    } catch {}
    this.transport.unicastToFacility(facilityId, payload);
  }

  // Lightweight connection status for a facility (for UI/status endpoints)
  public getFacilityConnectionStatus(facilityId: string): { connected: boolean; lastPongAt?: number } {
    const t: any = this.transport as any;
    if (t && t['facilityToClient'] && typeof t['facilityToClient'].get === 'function') {
      const client = t['facilityToClient'].get(facilityId);
      if (client) {
        const lastPongAt = client.lastPongAt ?? client.lastActivityAt ?? undefined;
        return { connected: true, lastPongAt };
      }
    }
    return { connected: false };
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

      // Inbound /ws/gateway is the authoritative liveness signal for every gateway type:
      // any traffic within the keepalive window means the gateway is online. Outbound
      // polling is deprecated/disabled, so we do not special-case HTTP gateways here.
      const previousStatus = gw.status;
      const next: 'online' | 'offline' = connected ? 'online' : 'offline';
      if (next === 'online') {
        await this.gatewayModel.updateStatusAndLastSeen(gw.id, 'online');
      } else {
        await this.gatewayModel.updateStatus(gw.id, 'offline');
      }

      if (previousStatus !== next) {
        void notifyGatewayStatusAfterDbUpdate({
          facilityId,
          gatewayId: gw.id,
          gatewayName: gw.name,
          previousStatus,
          nextStatus: next,
          reason: event.reason,
        });
      }

      const wsService = WebSocketService.getInstance();
      await wsService.broadcastGatewayStatusUpdate(facilityId, gw.id);
    } catch (error) {
      logger.warn(`syncGatewayDbWithInboundConnection failed facility=${facilityId}`, error);
    }
  }
}


