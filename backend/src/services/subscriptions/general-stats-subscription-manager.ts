import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { GeneralStatsService } from '@/services/general-stats.service';

/**
 * General Stats Subscription Manager
 *
 * Manages real-time subscriptions to system-wide statistics and metrics.
 * Provides facility-scoped dashboard data including unit counts, device status,
 * connectivity metrics, and operational statistics.
 *
 * Subscription Type: 'general_stats'
 *
 * Data Provided:
 * - Total units and occupancy statistics
 * - Device connectivity and battery levels
 * - Gateway status and network health
 * - Facility-specific metrics (scoped by user permissions)
 *
 * Access Control:
 * - DEV_ADMIN: Full system statistics across all facilities
 * - ADMIN: Full system statistics across all facilities
 * - FACILITY_ADMIN: Statistics limited to assigned facilities
 * - Other roles: Access denied
 */
export class GeneralStatsSubscriptionManager extends BaseSubscriptionManager {
  private generalStatsService = GeneralStatsService.getInstance();

  getSubscriptionType(): string {
    return 'general_stats';
  }

  canSubscribe(userRole: UserRole): boolean {
    // Admin and Dev Admin see all data
    if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
      return true;
    }

    // Facility Admin sees only their associated facilities
    if (userRole === UserRole.FACILITY_ADMIN) {
      return true;
    }

    // Other roles cannot access general stats
    return false;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const stats = await this.generalStatsService.getScopedStats(client.userId, client.userRole);
      this.sendMessage(ws, {
        type: 'general_stats_update',
        subscriptionId,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending initial general stats:', error);
      this.sendError(ws, 'Failed to load initial general stats data');
    }
  }

  public async broadcastUpdate(): Promise<void> {
    try {
      // Get all active general stats subscriptions
      const activeSubscriptions = Array.from(this.watchers.keys());
      
      if (activeSubscriptions.length === 0) {
        return;
      }

      // Group by user to avoid duplicate calculations
      const userStats = new Map<string, any>();
      
      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) {
          this.logger.warn(`No client context found for subscription ${subscriptionId}`);
          continue;
        }

        // Check if we already calculated stats for this user
        const userKey = `${client.userId}-${client.userRole}`;
        if (!userStats.has(userKey)) {
          try {
            const stats = await this.generalStatsService.getScopedStats(client.userId, client.userRole);
            userStats.set(userKey, stats);
          } catch (error) {
            this.logger.error(`Error calculating stats for user ${client.userId}:`, error);
            continue;
          }
        }

        const stats = userStats.get(userKey);
        const watchers = this.watchers.get(subscriptionId);
        
        if (watchers) {
          watchers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  type: 'general_stats_update',
                  subscriptionId,
                  data: stats,
                  timestamp: new Date().toISOString()
                }));
              } catch (error) {
                this.logger.error(`Error sending stats to WebSocket:`, error);
                // Remove broken connections
                watchers.delete(ws);
                if (watchers.size === 0) {
                  this.watchers.delete(subscriptionId);
                  this.clientContext.delete(subscriptionId);
                }
              }
            } else {
              // Remove closed connections
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
              }
            }
          });
        }
      }
    } catch (error) {
      this.logger.error('Error broadcasting general stats update:', error);
    }
  }
}
