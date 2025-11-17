import { Server as HTTPServer } from 'http';

/**
 * GatewayTransport abstracts how commands are delivered to physical gateways.
 *
 * Implementations may use WebSockets, MQTT, or other transports. The rest of
 * the system should depend only on this interface for sending messages.
 */
export interface GatewayTransport {
  /**
   * Initialize the underlying transport and bind to the HTTP server if needed.
   */
  initialize(server: HTTPServer): void;

  /**
   * Send a message to all connected gateways.
   */
  broadcast(payload: any): void;

  /**
   * Send a message to the gateway connected for a specific facility.
   */
  unicastToFacility(facilityId: string, payload: any): void;
}


