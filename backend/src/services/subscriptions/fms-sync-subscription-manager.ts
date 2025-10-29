import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FacilityModel } from '@/models/facility.model';

/**
 * FMS Sync Status Interface
 *
 * Represents the current synchronization state between BluLok and external FMS systems.
 * Provides comprehensive status information for monitoring and troubleshooting.
 */
interface FMSSyncStatus {
  /** Facility identifier */
  facilityId: string;
  /** Human-readable facility name */
  facilityName?: string;
  /** ISO timestamp of last sync attempt */
  lastSyncTime: string | null;
  /** Current sync status */
  status: 'completed' | 'failed' | 'partial' | 'never_synced' | 'not_configured';
  /** Number of changes detected in last sync */
  changesDetected?: number;
  /** Number of changes successfully applied */
  changesApplied?: number;
  /** Error message if sync failed */
  errorMessage?: string;
}

/**
 * FMS Sync Subscription Manager
 *
 * Manages real-time subscriptions to Facility Management System synchronization status.
 * Provides live monitoring of FMS integration health, sync progress, and error reporting.
 *
 * Subscription Type: 'fms_sync_status'
 *
 * Key Features:
 * - Real-time FMS sync status monitoring across all facilities
 * - Integration health dashboards for administrators
 * - Sync failure alerts and error reporting
 * - Facility-scoped status visibility
 * - Comprehensive sync history and metrics
 *
 * Data Provided:
 * - Current sync status for each facility (completed/failed/partial/never_synced/not_configured)
 * - Last sync timestamps and change counts
 * - Error messages and diagnostic information
 * - Facility-specific FMS configuration status
 * - Real-time updates when syncs complete or fail
 *
 * Access Control:
 * - ADMIN, DEV_ADMIN: Full system-wide FMS status visibility
 * - FACILITY_ADMIN: Limited to assigned facilities only
 * - Other roles: Access denied
 *
 * Sync Status Types:
 * - completed: Sync successful with all changes applied
 * - failed: Sync encountered errors, manual intervention required
 * - partial: Some changes applied, others failed
 * - never_synced: FMS configured but never synchronized
 * - not_configured: No FMS integration configured for facility
 */
export class FMSSyncSubscriptionManager extends BaseSubscriptionManager {
  private syncLogModel: FMSSyncLogModel;
  private configModel: FMSConfigurationModel;
  private facilityModel: FacilityModel;

  constructor() {
    super();
    this.syncLogModel = new FMSSyncLogModel();
    this.configModel = new FMSConfigurationModel();
    this.facilityModel = new FacilityModel();
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

      let facilityNameMap: Map<string, string> = new Map();

      if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
        // Admin can see ALL facilities - get them from the facility model
        const allFacilities = await this.facilityModel.findAll();
        facilityIds = allFacilities.facilities.map(f => f.id);
        // Create a map of facility ID to name for quick lookup
        allFacilities.facilities.forEach(f => facilityNameMap.set(f.id, f.name));
        this.logger.info(`📡 FMS Sync: Admin/DevAdmin - checking ${facilityIds.length} total facilities`);
      } else if (client.userRole === UserRole.FACILITY_ADMIN) {
        // Facility admin can only see their own facilities
        facilityIds = client.facilityIds || [];
        // For facility admins, we don't have facility names in the WebSocket data
        // They should come from the frontend auth state
        this.logger.info(`📡 FMS Sync: Facility Admin - checking ${facilityIds.length} assigned facilities`);
      } else {
        this.logger.info(`📡 FMS Sync: User role ${client.userRole} has no FMS access`);
        return statuses;
      }

      // For each facility, get the FMS status (or indicate not configured)
      for (const facilityId of facilityIds) {
        try {
          // Check if FMS is configured for this facility
          const config = await this.configModel.findByFacilityId(facilityId);

          if (!config || !config.is_enabled) {
            // FMS not configured or disabled - include facility with "not_configured" status
            this.logger.debug(`📡 FMS Sync: No FMS config or disabled for facility ${facilityId}`);
            const status: FMSSyncStatus = {
              facilityId,
              lastSyncTime: null,
              status: 'not_configured',
            };
            const name = facilityNameMap.get(facilityId);
            if (name) status.facilityName = name;
            statuses.push(status);
            continue;
          }

          this.logger.info(`📡 FMS Sync: Processing facility ${facilityId} with FMS provider ${config.provider_type}`);

          // Get the latest sync log
          const latestSync = await this.syncLogModel.findLatestByFacilityId(facilityId);

          const name = facilityNameMap.get(facilityId);

          if (!latestSync) {
            // FMS configured but never synced
            const status: FMSSyncStatus = {
              facilityId,
              lastSyncTime: null,
              status: 'never_synced',
            };
            if (name) status.facilityName = name;
            statuses.push(status);
          } else {
            // Has sync history
            const syncStatus: FMSSyncStatus = {
              facilityId,
              lastSyncTime: (latestSync.completed_at || latestSync.started_at)?.toISOString() || null,
              status: latestSync.sync_status as 'completed' | 'failed' | 'partial',
              changesDetected: latestSync.changes_detected,
              changesApplied: latestSync.changes_applied,
            };
            if (name) syncStatus.facilityName = name;
            if (latestSync.error_message) {
              syncStatus.errorMessage = latestSync.error_message;
            }
            statuses.push(syncStatus);
          }
        } catch (error) {
          this.logger.error(`Error getting FMS sync status for facility ${facilityId}:`, error);
          // Include facility with error status
          const status: FMSSyncStatus = {
            facilityId,
            lastSyncTime: null,
            status: 'not_configured',
            errorMessage: 'Error loading FMS status',
          };
          const name = facilityNameMap.get(facilityId);
          if (name) status.facilityName = name;
          statuses.push(status);
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
