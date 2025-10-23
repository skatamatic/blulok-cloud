/**
 * FMS API Service
 * 
 * Handles all FMS-related API calls
 */

import { apiService } from './api.service';
import {
  FMSConfiguration,
  FMSProviderConfig,
  FMSSyncResult,
  FMSChange,
  FMSSyncLog,
  FMSChangeApplicationResult,
} from '@/types/fms.types';

class FMSService {
  /**
   * Get FMS configuration for a facility
   */
  async getConfig(facilityId: string): Promise<FMSConfiguration | null> {
    try {
      const data = await apiService.get(`/fms/config/${facilityId}`);
      return data.config || null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No configuration exists
      }
      throw error;
    }
  }

  /**
   * Create FMS configuration
   */
  async createConfig(data: {
    facility_id: string;
    provider_type: string;
    config: FMSProviderConfig;
    is_enabled: boolean;
  }): Promise<FMSConfiguration> {
    const result = await apiService.post('/fms/config', data);
    
    if (!result.config) {
      throw new Error('Failed to create FMS configuration');
    }
    
    return result.config;
  }

  /**
   * Update FMS configuration
   */
  async updateConfig(
    configId: string,
    data: Partial<{
      provider_type: string;
      config: FMSProviderConfig;
      is_enabled: boolean;
    }>
  ): Promise<FMSConfiguration> {
    const result = await apiService.put(`/fms/config/${configId}`, data);
    
    if (!result.config) {
      throw new Error('Failed to update FMS configuration');
    }
    
    return result.config;
  }

  /**
   * Delete FMS configuration
   */
  async deleteConfig(configId: string): Promise<void> {
    await apiService.delete(`/fms/config/${configId}`);
  }

  /**
   * Test FMS connection
   */
  async testConnection(configId: string): Promise<boolean> {
    const data = await apiService.post(`/fms/config/${configId}/test`);
    return data.connected || false;
  }

  /**
   * Trigger manual sync
   */
  async triggerSync(facilityId: string): Promise<FMSSyncResult> {
    const data = await apiService.post(`/fms/sync/${facilityId}`);
    
    if (!data.result) {
      throw new Error('Failed to trigger sync');
    }
    
    return data.result;
  }

  /**
   * Get sync history for a facility
   */
  async getSyncHistory(
    facilityId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: FMSSyncLog[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const data = await apiService.get(`/fms/sync/${facilityId}/history?${params.toString()}`);
    
    return {
      logs: data.logs || [],
      total: data.total || 0,
    };
  }

  /**
   * Get sync details
   */
  async getSyncDetails(syncLogId: string): Promise<FMSSyncLog> {
    const data = await apiService.get(`/fms/sync/${syncLogId}`);
    
    if (!data.syncLog) {
      throw new Error('Sync log not found');
    }
    
    return data.syncLog;
  }

  /**
   * Get pending changes for review
   */
  async getPendingChanges(syncLogId: string): Promise<FMSChange[]> {
    const data = await apiService.get(`/fms/changes/${syncLogId}/pending`);
    return data.changes || [];
  }

  /**
   * Cancel an active sync
   */
  async cancelSync(facilityId: string): Promise<boolean> {
    const result = await apiService.post(`/fms/sync/${facilityId}/cancel`);
    return result.cancelled || false;
  }

  /**
   * Review changes (accept or reject)
   */
  async reviewChanges(
    syncLogId: string,
    changeIds: string[],
    accepted: boolean
  ): Promise<void> {
    await apiService.post('/fms/changes/review', {
      syncLogId,
      changeIds,
      accepted,
    });
  }

  /**
   * Apply accepted changes
   */
  async applyChanges(
    syncLogId: string,
    changeIds: string[]
  ): Promise<FMSChangeApplicationResult> {
    const data = await apiService.post('/fms/changes/apply', {
      syncLogId,
      changeIds,
    });
    
    return data.result;
  }
}

export const fmsService = new FMSService();
