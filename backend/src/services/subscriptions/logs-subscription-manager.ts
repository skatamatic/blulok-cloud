import { BaseSubscriptionManager } from './base-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';
import { SubscriptionClient } from './base-subscription-manager';

/**
 * Logs Subscription Manager
 *
 * Manages real-time log streaming subscriptions for system monitoring and debugging.
 * Provides live log data to development and operations teams for troubleshooting.
 *
 * Subscription Type: 'logs'
 *
 * Key Features:
 * - Real-time log streaming without historical data
 * - System-wide log aggregation from all services
 * - Connection health monitoring and automatic cleanup
 * - Subscription statistics for monitoring usage
 *
 * Data Provided:
 * - Live log entries with timestamps
 * - Log types (error, info, debug, warn)
 * - Log content and metadata
 * - Real-time system activity monitoring
 *
 * Access Control:
 * - DEV_ADMIN only (highly sensitive debugging information)
 * - No facility scoping (system-wide logs)

 *
 * Security Considerations:
 * - Highly restricted access (DEV_ADMIN only)
 * - No historical log exposure
 * - Connection monitoring prevents resource abuse
 * - Sensitive system information protection
 */
export class LogsSubscriptionManager extends BaseSubscriptionManager {
  getSubscriptionType(): string {
    return 'logs';
  }

  canSubscribe(userRole: UserRole): boolean {
    // Only DEV_ADMIN can subscribe to logs
    return userRole === UserRole.DEV_ADMIN;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    // For logs, we don't send initial data - logs are streamed as they happen
    // Just send a confirmation that the subscription is active
    this.sendMessage(ws, {
      type: 'logs_update',
      subscriptionId,
      data: {
        message: 'Log subscription active - you will receive live log updates',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast log updates to all subscribers
   */
  public broadcastLogUpdate(logType: string, content: string): void {
    const logData = {
      type: 'logs_update',
      data: {
        logType,
        content,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Broadcast to all active subscriptions
    this.watchers.forEach((watcherSet, subscriptionId) => {
      watcherSet.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              ...logData,
              subscriptionId
            }));
          } catch (error) {
            // Remove broken connections
            watcherSet.delete(ws);
            if (watcherSet.size === 0) {
              this.watchers.delete(subscriptionId);
            }
          }
        } else {
          // Remove closed connections
          watcherSet.delete(ws);
          if (watcherSet.size === 0) {
            this.watchers.delete(subscriptionId);
          }
        }
      });
    });
  }

  /**
   * Get the number of active log watchers
   */
  public getActiveWatcherCount(): number {
    let total = 0;
    this.watchers.forEach(watcherSet => {
      total += watcherSet.size;
    });
    return total;
  }

  /**
   * Get subscription statistics
   */
  public getStats(): { activeSubscriptions: number; totalWatchers: number } {
    return {
      activeSubscriptions: this.watchers.size,
      totalWatchers: this.getActiveWatcherCount()
    };
  }
}
