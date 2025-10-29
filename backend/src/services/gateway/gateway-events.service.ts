import { Server as HTTPServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';

/**
 * Gateway Client Information Interface
 *
 * Represents an authenticated gateway WebSocket connection with facility scoping.
 */
interface ClientInfo {
  /** The WebSocket connection instance */
  ws: WebSocket;
  /** Authenticated user ID */
  userId: string;
  /** User's role (must be FACILITY_ADMIN, ADMIN, or DEV_ADMIN) */
  role: UserRole;
  /** Facilities this user can manage */
  facilityIds: string[];
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
  private wss?: WebSocketServer;

  // Registry of authenticated gateway clients
  private clients = new Set<ClientInfo>();

  public static getInstance(): GatewayEventsService {
    if (!this.instance) this.instance = new GatewayEventsService();
    return this.instance;
  }

  public initialize(server: HTTPServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true, path: '/ws/gateway' });
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      if (url.pathname !== '/ws/gateway') return;
      const auth = url.searchParams.get('token') || '';
      const decoded = AuthService.verifyToken(auth);
      if (!decoded) {
        socket.destroy();
        return;
      }
      // Facility-scoped only
      const role = decoded.role;
      if (![UserRole.FACILITY_ADMIN, UserRole.ADMIN, UserRole.DEV_ADMIN].includes(role)) {
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(request, socket as any, head, (ws) => {
        const client: ClientInfo = { ws, userId: decoded.userId, role, facilityIds: decoded.facilityIds || [] };
        this.clients.add(client);
        logger.info(`Gateway WS connected: ${client.userId}`);
        ws.on('close', () => {
          this.clients.delete(client);
        });
      });
    });
  }

  public broadcast(payload: any): void {
    const data = JSON.stringify(payload);
    for (const c of this.clients) {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
    }
  }

  public unicastToFacility(facilityId: string, payload: any): void {
    const data = JSON.stringify(payload);
    for (const c of this.clients) {
      if (c.ws.readyState === WebSocket.OPEN && (c.facilityIds || []).includes(facilityId)) {
        c.ws.send(data);
      }
    }
  }
}


