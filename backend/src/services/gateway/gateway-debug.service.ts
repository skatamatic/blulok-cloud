import { logger } from '@/utils/logger';

export type GatewayDebugEventKind =
  | 'connection_opened'
  | 'connection_closed'
  | 'message_inbound'
  | 'message_outbound'
  | 'ping_sent'
  | 'pong_received'
  | 'heartbeat_timeout'
  | 'command_sent';

export interface GatewayDebugEvent {
  kind: GatewayDebugEventKind;
  facilityId?: string;
  userId?: string;
  type?: string;
  direction?: 'incoming' | 'outgoing';
  ts: number;
  lastActivityAt?: number;
  remote?: string;
  meta?: Record<string, any>;
}

type GatewayDebugSubscriber = (event: GatewayDebugEvent) => void;

/**
 * GatewayDebugService
 *
 * Lightweight in-memory pub/sub for gateway WebSocket debug events.
 * Used by DEV tooling (WebSocket subscriptions, E2E, local UI) to
 * observe live gateway communications without impacting production flows.
 */
export class GatewayDebugService {
  private static instance: GatewayDebugService;
  private subscribers: Set<GatewayDebugSubscriber> = new Set();

  public static getInstance(): GatewayDebugService {
    if (!GatewayDebugService.instance) {
      GatewayDebugService.instance = new GatewayDebugService();
    }
    return GatewayDebugService.instance;
  }

  public subscribe(handler: GatewayDebugSubscriber): () => void {
    this.subscribers.add(handler);
    logger.info('GatewayDebugService subscriber added');
    return () => {
      this.subscribers.delete(handler);
      logger.info('GatewayDebugService subscriber removed');
    };
  }

  public publish(event: GatewayDebugEvent): void {
    // Never throw from debug publishing
    for (const handler of this.subscribers) {
      try {
        handler(event);
      } catch (err) {
        logger.warn('GatewayDebugService subscriber error', err);
      }
    }
  }
}



