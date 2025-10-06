import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { UnitsService } from '@/services/units.service';

export class UnitsSubscriptionManager extends BaseSubscriptionManager {
  private unitsService: UnitsService;

  constructor() {
    super();
    this.unitsService = UnitsService.getInstance();
  }

  getSubscriptionType(): string {
    return 'units';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All roles can subscribe to units data
    return true;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      // Get all units and unlocked units separately
      const allUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole);
      const unlockedUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole, { unlocked: 'true' });
      
      // Compute stats client-side for widget compatibility
      const allUnits = allUnitsResult.units;
      const unlockedUnits = unlockedUnitsResult.units;
      const totalUnits = allUnits.length;
      const occupiedUnits = allUnits.filter(u => u.status === 'occupied').length;
      const availableUnits = allUnits.filter(u => u.status === 'available').length;
      const maintenanceUnits = allUnits.filter(u => u.status === 'maintenance').length;
      const reservedUnits = allUnits.filter(u => u.status === 'reserved').length;
      const unlockedCount = unlockedUnits.length;
      const lockedCount = totalUnits - unlockedCount;
      
      const unitsData = {
        unlockedUnits: unlockedUnits,
        totalUnits,
        occupiedUnits,
        availableUnits,
        maintenanceUnits,
        reservedUnits,
        unlockedCount,
        lockedCount,
        lastUpdated: new Date().toISOString()
      };
      
      this.sendMessage(ws, {
        type: 'units_update',
        subscriptionId,
        data: unitsData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending initial units data:', error);
      this.sendError(ws, 'Failed to load initial units data');
    }
  }

  public async broadcastUpdate(): Promise<void> {
    try {
      // Get all active units subscriptions
      const activeSubscriptions = Array.from(this.watchers.keys());
      
      if (activeSubscriptions.length === 0) {
        return;
      }

      // Group by user to avoid duplicate calculations
      const userUnitsData = new Map<string, any>();
      
      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) {
          this.logger.warn(`No client context found for subscription ${subscriptionId}`);
          continue;
        }

        // Check if we already calculated units data for this user
        const userKey = `${client.userId}-${client.userRole}`;
        if (!userUnitsData.has(userKey)) {
          try {
            // Get all units and unlocked units separately
            const allUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole);
            const unlockedUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole, { unlocked: 'true' });
            
            // Compute stats client-side for widget compatibility
            const allUnits = allUnitsResult.units;
            const unlockedUnits = unlockedUnitsResult.units;
            const totalUnits = allUnits.length;
            const occupiedUnits = allUnits.filter(u => u.status === 'occupied').length;
            const availableUnits = allUnits.filter(u => u.status === 'available').length;
            const maintenanceUnits = allUnits.filter(u => u.status === 'maintenance').length;
            const reservedUnits = allUnits.filter(u => u.status === 'reserved').length;
            const unlockedCount = unlockedUnits.length;
            const lockedCount = totalUnits - unlockedCount;
            
            const unitsData = {
              unlockedUnits: unlockedUnits,
              totalUnits,
              occupiedUnits,
              availableUnits,
              maintenanceUnits,
              reservedUnits,
              unlockedCount,
              lockedCount,
              lastUpdated: new Date().toISOString()
            };
            
            userUnitsData.set(userKey, unitsData);
          } catch (error) {
            this.logger.error(`Error calculating units data for user ${client.userId}:`, error);
            continue;
          }
        }

        const unitsData = userUnitsData.get(userKey);
        const watchers = this.watchers.get(subscriptionId);
        
        if (watchers) {
          watchers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  type: 'units_update',
                  subscriptionId,
                  data: unitsData,
                  timestamp: new Date().toISOString()
                }));
              } catch (error) {
                this.logger.error(`Error sending units data to WebSocket:`, error);
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
      this.logger.error('Error broadcasting units update:', error);
    }
  }
}
