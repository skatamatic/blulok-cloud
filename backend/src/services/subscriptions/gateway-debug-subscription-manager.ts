import { WebSocket } from 'ws';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { GatewayDebugEvent, GatewayDebugService } from '@/services/gateway/gateway-debug.service';

/**
 * GatewayDebugSubscriptionManager
 *
 * DEV_ADMIN-only subscription that streams gateway WebSocket debug events
 * (connection lifecycle, heartbeat PING/PONG, message types) over the
 * standard frontend WebSocket channel.
 */
export class GatewayDebugSubscriptionManager extends BaseSubscriptionManager {
  private unsubscribeDebug?: () => void;

  constructor() {
    super();
    const debug = GatewayDebugService.getInstance();
    this.unsubscribeDebug = debug.subscribe((event) => this.broadcastUpdateInternal(event));
  }

  getSubscriptionType(): string {
    return 'gateway_debug';
  }

  canSubscribe(userRole: UserRole): boolean {
    return userRole === UserRole.DEV_ADMIN;
  }

  protected async sendInitialData(ws: WebSocket, _subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    const message: WebSocketMessage = {
      type: 'subscription',
      subscriptionType: this.getSubscriptionType(),
      data: { message: 'Gateway debug subscription active' },
      timestamp: new Date().toISOString(),
    };
    this.sendMessage(ws, message);
  }

  broadcastUpdate(data: GatewayDebugEvent): void {
    this.broadcastUpdateInternal(data);
  }

  private broadcastUpdateInternal(event: GatewayDebugEvent): void {
    const payload: WebSocketMessage = {
      type: 'data',
      subscriptionType: this.getSubscriptionType(),
      data: event,
      timestamp: new Date().toISOString(),
    };
    for (const watcherSet of this.watchers.values()) {
      for (const ws of watcherSet) {
        this.sendMessage(ws, payload);
      }
    }
  }
}



