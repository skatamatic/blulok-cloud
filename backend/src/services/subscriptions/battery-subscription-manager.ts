import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { UnitsService } from '@/services/units.service';

/**
 * Battery Status Subscription Manager
 *
 * Manages real-time subscriptions to device battery levels and connectivity status.
 * Provides critical monitoring for battery-powered smart locks and access devices.
 *
 * Subscription Type: 'battery_status'
 *
 * Key Features:
 * - Real-time battery level monitoring
 * - Critical battery alerts (≤5% threshold)
 * - Low battery warnings (≤20% threshold)
 * - Device connectivity status tracking
 * - Facility-scoped battery health dashboards
 *
 * Data Provided:
 * - Units with low battery levels (<20%)
 * - Critical battery units (<5%) requiring immediate attention
 * - Device connectivity statistics (online/offline counts)
 * - Battery level distributions and trends
 * - Real-time alerts for battery maintenance
 *
 * Access Control:
 * - All authenticated users can subscribe
 * - Facility-scoped data based on user role and permissions
 * - Role-based filtering for appropriate data access
 *
 * Battery Thresholds:
 * - Critical: ≤5% - Immediate replacement required
 * - Low: 6-20% - Replacement recommended soon
 * - Normal: >20% - Acceptable battery levels
 */
export class BatterySubscriptionManager extends BaseSubscriptionManager {
  private unitsService: UnitsService;

  constructor() {
    super();
    this.unitsService = UnitsService.getInstance();
  }

  getSubscriptionType(): string {
    return 'battery_status';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All roles can subscribe to battery status data
    return true;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      // Get all units and filter for low battery units
      const allUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole);
      const lowBatteryUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole, { 
        battery_threshold: 20 // Units with battery <= 20%
      });
      
      // Compute battery stats
      const allUnits = allUnitsResult.units;
      const lowBatteryUnits = lowBatteryUnitsResult.units;
      const totalUnits = allUnits.length;
      const criticalBatteryUnits = allUnits.filter(u => (u.battery_level || 0) <= 5).length;
      const lowBatteryCount = allUnits.filter(u => (u.battery_level || 0) <= 20 && (u.battery_level || 0) > 5).length;
      const offlineUnits = allUnits.filter(u => !u.is_online).length;
      const onlineUnits = allUnits.filter(u => u.is_online).length;
      
      const batteryData = {
        lowBatteryUnits: lowBatteryUnits,
        totalUnits,
        criticalBatteryUnits,
        lowBatteryCount,
        offlineUnits,
        onlineUnits,
        lastUpdated: new Date().toISOString()
      };
      
      this.sendMessage(ws, {
        type: 'battery_status_update',
        subscriptionId,
        data: batteryData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending initial battery data:', error);
      this.sendError(ws, 'Failed to load initial battery data');
    }
  }

  public async broadcastUpdate(): Promise<void> {
    try {
      // Get all active battery status subscriptions
      const activeSubscriptions = Array.from(this.watchers.keys());
      
      if (activeSubscriptions.length === 0) {
        return;
      }

      // Group by user to avoid duplicate calculations
      const userBatteryData = new Map<string, any>();
      
      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) {
          this.logger.warn(`No client context found for subscription ${subscriptionId}`);
          continue;
        }

        // Check if we already calculated battery data for this user
        const userKey = `${client.userId}-${client.userRole}`;
        if (!userBatteryData.has(userKey)) {
          try {
            // Get all units and filter for low battery units
            const allUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole);
            const lowBatteryUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole, { 
              battery_threshold: 20 // Units with battery <= 20%
            });
            
            // Compute battery stats
            const allUnits = allUnitsResult.units;
            const lowBatteryUnits = lowBatteryUnitsResult.units;
            const totalUnits = allUnits.length;
            const criticalBatteryUnits = allUnits.filter(u => (u.battery_level || 0) <= 5).length;
            const lowBatteryCount = allUnits.filter(u => (u.battery_level || 0) <= 20 && (u.battery_level || 0) > 5).length;
            const offlineUnits = allUnits.filter(u => !u.is_online).length;
            const onlineUnits = allUnits.filter(u => u.is_online).length;
            
            const batteryData = {
              lowBatteryUnits: lowBatteryUnits,
              totalUnits,
              criticalBatteryUnits,
              lowBatteryCount,
              offlineUnits,
              onlineUnits,
              lastUpdated: new Date().toISOString()
            };
            
            userBatteryData.set(userKey, batteryData);
          } catch (error) {
            this.logger.error(`Error calculating battery data for user ${client.userId}:`, error);
            continue;
          }
        }

        const batteryData = userBatteryData.get(userKey);
        const watchers = this.watchers.get(subscriptionId);
        
        if (watchers) {
          watchers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  type: 'battery_status_update',
                  subscriptionId,
                  data: batteryData,
                  timestamp: new Date().toISOString()
                }));
              } catch (error) {
                this.logger.error(`Error sending battery data to WebSocket:`, error);
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
      this.logger.error('Error broadcasting battery status update:', error);
    }
  }
}
