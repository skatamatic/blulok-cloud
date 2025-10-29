import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { GatewayCommandModel } from '@/models/gateway-command.model';

/**
 * Command Queue Subscription Manager
 *
 * Manages real-time subscriptions to gateway command queue status and execution monitoring.
 * Provides visibility into asynchronous command processing and queue health.
 *
 * Subscription Type: 'command_queue'
 *
 * Key Features:
 * - Real-time command queue monitoring and status updates
 * - Facility-scoped command visibility for multi-tenant environments
 * - Command execution progress tracking
 * - Queue health metrics and failure detection
 * - Dead letter queue monitoring for failed commands
 *
 * Data Provided:
 * - Pending, queued, and in-progress commands
 * - Command execution status and timestamps
 * - Failed and dead-letter commands requiring attention
 * - Queue depth and processing statistics
 * - Real-time command completion notifications
 *
 * Access Control:
 * - All authenticated users can subscribe
 * - Facility-scoped data based on user role and permissions
 * - Role-based filtering (TENANT sees facility commands, ADMIN sees all)
 *
 * Command Status Types:
 * - pending: Command created but not yet queued
 * - queued: Command waiting for gateway availability
 * - in_progress: Command being executed by gateway
 * - completed: Command executed successfully
 * - failed: Command execution failed (retryable)
 * - dead_letter: Command permanently failed (manual intervention required)
 */
export class CommandQueueSubscriptionManager extends BaseSubscriptionManager {
  private model: GatewayCommandModel;

  constructor() {
    super();
    this.model = new GatewayCommandModel();
  }

  getSubscriptionType(): string {
    return 'command_queue';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All roles can subscribe; scoping handled per facilities
    return true;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const payload = await this.buildPayload(client);
      this.sendMessage(ws, {
        type: 'command_queue_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending initial command queue data:', error);
      this.sendError(ws, 'Failed to load command queue');
    }
  }

  public async broadcastUpdate(): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) continue;
        const payload = await this.buildPayload(client);
        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) continue;
        watchers.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                type: 'command_queue_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString()
              }));
            } catch (err) {
              this.logger.error('Error sending command_queue update:', err);
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
              }
            }
          } else {
            watchers.delete(ws);
            if (watchers.size === 0) {
              this.watchers.delete(subscriptionId);
              this.clientContext.delete(subscriptionId);
            }
          }
        });
      }
    } catch (error) {
      this.logger.error('Error broadcasting command_queue update:', error);
    }
  }

  private async buildPayload(client: SubscriptionClient): Promise<any> {
    // Admins see all; others restricted to their facilities
    const facilities = (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN)
      ? undefined
      : (client.facilityIds || []);
    const { items, total } = await this.model.list({ facilities: facilities || undefined, statuses: ['pending', 'queued', 'in_progress', 'failed', 'dead_letter'] as any }, 50, 0);
    return {
      total,
      items,
      lastUpdated: new Date().toISOString()
    };
  }
}


