import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';

interface FMSSyncStatus {
  facilityId: string;
  facilityName?: string;
  lastSyncTime: string | null;
  status: 'completed' | 'failed' | 'partial' | 'never_synced';
  changesDetected?: number;
  changesApplied?: number;
  errorMessage?: string;
}

export class FMSSyncSubscriptionManager extends BaseSubscriptionManager {
  private syncLogModel: FMSSyncLogModel;
  private configModel: FMSConfigurationModel;

  constructor() {
    super();
    this.syncLogModel = new FMSSyncLogModel();
    this.configModel = new FMSConfigurationModel();
  }

  getSubscriptionType(): string {
    return 'fms_sync_status';
  }

  canSubscribe(userRole: UserRole): boolean {
    // Only ADMIN, DEV_ADMIN, and FACILITY_ADMIN can subscribe to FMS sync status
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      this.logger.info(`📡 FMS Sync: Sending initial data for user ${client.userId} (${client.userRole})`);
      const syncStatuses = await this.getFMSSyncStatuses(client);
      
      this.logger.info(`📡 FMS Sync: Found ${syncStatuses.length} facilities with FMS configured`, {
        facilityIds: syncStatuses.map(s => s.facilityId),
        statuses: syncStatuses.map(s => ({ id: s.facilityId, status: s.status }))
      });
      
      this.sendMessage(ws, {
        type: 'fms_sync_status_update',
        subscriptionId,
        data: {
          facilities: syncStatuses,
          lastUpdated: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      
      this.logger.info(`📡 FMS Sync: Initial data sent successfully for subscription ${subscriptionId}`);
    } catch (error) {
      this.logger.error('Error sending initial FMS sync data:', error);
      this.sendError(ws, 'Failed to load initial FMS sync data');
    }
  }

  /**
   * Get FMS sync statuses for all facilities the user has access to
   */
  private async getFMSSyncStatuses(client: SubscriptionClient): Promise<FMSSyncStatus[]> {
    const statuses: FMSSyncStatus[] = [];

    try {
      // Get user's facility IDs based on role
      let facilityIds: string[] = [];

      if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
        // Admin can see all facilities with FMS configured
        const allConfigs = await this.configModel.findAll();
        facilityIds = allConfigs.map(c => c.facility_id);
        this.logger.info(`📡 FMS Sync: Admin/DevAdmin - checking ${facilityIds.length} facilities with FMS configs`);
      } else if (client.userRole === UserRole.FACILITY_ADMIN) {
        // Facility admin can only see their own facilities
        facilityIds = client.facilityIds || [];
        this.logger.info(`📡 FMS Sync: Facility Admin - checking ${facilityIds.length} assigned facilities`);
      } else {
        this.logger.info(`📡 FMS Sync: User role ${client.userRole} has no FMS access`);
      }

      // For each facility, get the latest sync log
      for (const facilityId of facilityIds) {
        try {
          // Check if FMS is configured for this facility
          const config = await this.configModel.findByFacilityId(facilityId);
          if (!config) {
            this.logger.debug(`📡 FMS Sync: No FMS config found for facility ${facilityId}`);
            continue; // Skip facilities without FMS configured
          }
          if (!config.is_enabled) {
            this.logger.debug(`📡 FMS Sync: FMS config disabled for facility ${facilityId}`);
            continue; // Skip disabled FMS
          }
          
          this.logger.info(`📡 FMS Sync: Processing facility ${facilityId} with FMS provider ${config.provider_type}`);

          // Get the latest sync log
          const latestSync = await this.syncLogModel.findLatestByFacilityId(facilityId);

          if (!latestSync) {
            // FMS configured but never synced
            statuses.push({
              facilityId,
              lastSyncTime: null,
              status: 'never_synced',
            });
          } else {
            // Has sync history
            const syncStatus: FMSSyncStatus = {
              facilityId,
              lastSyncTime: (latestSync.completed_at || latestSync.started_at)?.toISOString() || null,
              status: latestSync.sync_status as 'completed' | 'failed' | 'partial',
              changesDetected: latestSync.changes_detected,
              changesApplied: latestSync.changes_applied,
            };
            if (latestSync.error_message) {
              syncStatus.errorMessage = latestSync.error_message;
            }
            statuses.push(syncStatus);
          }
        } catch (error) {
          this.logger.error(`Error getting FMS sync status for facility ${facilityId}:`, error);
          // Continue with other facilities
        }
      }
    } catch (error) {
      this.logger.error('Error getting FMS sync statuses:', error);
      throw error;
    }

    return statuses;
  }

  /**
   * Broadcast FMS sync status update to all subscribed clients
   * This should be called whenever an FMS sync completes
   */
  public async broadcastUpdate(facilityId?: string): Promise<void> {
    try {
      // Get all active FMS sync status subscriptions
      const activeSubscriptions = Array.from(this.watchers.keys());
      
      if (activeSubscriptions.length === 0) {
        return;
      }

      // Group by user to avoid duplicate calculations
      const userSyncData = new Map<string, FMSSyncStatus[]>();
      
      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) {
          this.logger.warn(`No client context found for subscription ${subscriptionId}`);
          continue;
        }

        // Check if we already calculated sync data for this user
        const userKey = `${client.userId}-${client.userRole}`;
        if (!userSyncData.has(userKey)) {
          try {
            const syncStatuses = await this.getFMSSyncStatuses(client);
            userSyncData.set(userKey, syncStatuses);
          } catch (error) {
            this.logger.error(`Error calculating FMS sync data for user ${client.userId}:`, error);
            continue;
          }
        }

        const syncStatuses = userSyncData.get(userKey);
        const watchers = this.watchers.get(subscriptionId);
        
        if (watchers) {
          watchers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  type: 'fms_sync_status_update',
                  subscriptionId,
                  data: {
                    facilities: syncStatuses,
                    lastUpdated: new Date().toISOString(),
                    updatedFacilityId: facilityId, // Indicate which facility was updated (if specific)
                  },
                  timestamp: new Date().toISOString()
                }));
              } catch (error) {
                this.logger.error(`Error sending FMS sync data to WebSocket:`, error);
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
      this.logger.error('Error broadcasting FMS sync status update:', error);
    }
  }
}
