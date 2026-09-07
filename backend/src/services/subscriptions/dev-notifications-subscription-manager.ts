import { WebSocket } from 'ws';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { NotificationDebugService, NotificationDebugEvent } from '@/services/notifications/notification-debug.service';

/**
 * DevNotificationsSubscriptionManager
 *
 * DEV_ADMIN-only subscription that streams notification debug events
 * (invite + OTP payloads) over the standard frontend WebSocket channel.
 * This is used by E2E and local dev tools to observe what the
 * NotificationService is sending without hitting real SMS/email providers.
 */
export class DevNotificationsSubscriptionManager extends BaseSubscriptionManager {
  private unsubscribeDebug?: () => void;

  constructor() {
    super();
    const debug = NotificationDebugService.getInstance();
    this.unsubscribeDebug = debug.subscribe((event) => this.broadcastUpdateInternal(event));
  }

  getSubscriptionType(): string {
    return 'dev_notifications';
  }

  canSubscribe(userRole: UserRole): boolean {
    return userRole === UserRole.DEV_ADMIN;
  }

  protected async sendInitialData(ws: WebSocket, _subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    // No historical buffer; just acknowledge subscription.
    const message: WebSocketMessage = {
      type: 'subscription',
      subscriptionType: this.getSubscriptionType(),
      data: { message: 'Dev notifications subscription active' },
      timestamp: new Date().toISOString(),
    };
    this.sendMessage(ws, message);
  }

  broadcastUpdate(data: NotificationDebugEvent): void {
    this.broadcastUpdateInternal(data);
  }

  private broadcastUpdateInternal(event: NotificationDebugEvent): void {
    const payload: WebSocketMessage = {
      type: 'dev_notifications_update' as any,
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


