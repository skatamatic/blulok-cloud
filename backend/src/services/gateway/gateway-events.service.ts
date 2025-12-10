import { Server as HTTPServer } from 'http';
import { logger } from '@/utils/logger';
import { GatewayTransport } from './gateway-transport.interface';
import { WebsocketGatewayTransport } from './websocket-gateway.transport';

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
 * - JWT token required in WebSocket upgrade request
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

  public static getInstance(): GatewayEventsService {
    if (!this.instance) this.instance = new GatewayEventsService();
    return this.instance;
  }

  private constructor() {
    // Default to WebSocket transport; tests may replace with mocks or Noop
    this.transport = new WebsocketGatewayTransport();
  }

  // Allow tests/bootstrappers to override transport if needed
  public setTransport(transport: GatewayTransport): void {
    this.transport = transport || new NoopTransport();
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
}


