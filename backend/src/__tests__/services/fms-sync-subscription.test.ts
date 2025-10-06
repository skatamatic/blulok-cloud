/**
 * FMS Sync Subscription Manager Tests
 * 
 * Tests WebSocket subscription for FMS sync status updates
 */

import { WebSocket } from 'ws';
import { FMSSyncSubscriptionManager } from '@/services/subscriptions/fms-sync-subscription-manager';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { UserRole } from '@/types/auth.types';
import { SubscriptionClient } from '@/services/subscriptions/base-subscription-manager';

// Mock the models
jest.mock('@/models/fms-sync-log.model');
jest.mock('@/models/fms-configuration.model');

describe('FMSSyncSubscriptionManager', () => {
  let manager: FMSSyncSubscriptionManager;
  let mockWs: jest.Mocked<WebSocket>;
  let mockSyncLogModel: jest.Mocked<FMSSyncLogModel>;
  let mockConfigModel: jest.Mocked<FMSConfigurationModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    manager = new FMSSyncSubscriptionManager();
    
    // Create mock WebSocket
    mockWs = {
      send: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;

    // Get mocked model instances
    mockSyncLogModel = (manager as any).syncLogModel;
    mockConfigModel = (manager as any).configModel;
  });

  describe('getSubscriptionType', () => {
    it('should return correct subscription type', () => {
      expect(manager.getSubscriptionType()).toBe('fms_sync_status');
    });
  });

  describe('canSubscribe - RBAC', () => {
    it('should allow ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
    });

    it('should allow DEV_ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    });

    it('should allow FACILITY_ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    });

    it('should NOT allow TENANT to subscribe', () => {
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(false);
    });

    it('should NOT allow MAINTENANCE to subscribe', () => {
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(false);
    });
  });

  describe('sendInitialData', () => {
    it('should send initial FMS sync status for ADMIN (all facilities)', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      // Mock all FMS configurations
      mockConfigModel.findAll.mockResolvedValue([
        {
          id: 'config-1',
          facility_id: 'facility-1',
          provider_type: 'simulated',
          is_enabled: true,
        } as any,
        {
          id: 'config-2',
          facility_id: 'facility-2',
          provider_type: 'storedge',
          is_enabled: true,
        } as any,
      ]);

      // Mock facility configs
      mockConfigModel.findByFacilityId
        .mockResolvedValueOnce({
          id: 'config-1',
          facility_id: 'facility-1',
          is_enabled: true,
        } as any)
        .mockResolvedValueOnce({
          id: 'config-2',
          facility_id: 'facility-2',
          is_enabled: true,
        } as any);

      // Mock sync logs
      mockSyncLogModel.findLatestByFacilityId
        .mockResolvedValueOnce({
          id: 'sync-1',
          facility_id: 'facility-1',
          sync_status: 'completed',
          started_at: new Date('2025-01-01T10:00:00Z'),
          completed_at: new Date('2025-01-01T10:05:00Z'),
          changes_detected: 5,
          changes_applied: 5,
        } as any)
        .mockResolvedValueOnce(null); // facility-2 never synced

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"fms_sync_status_update"')
      );

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities).toHaveLength(2);
      expect(sentData.data.facilities[0]).toMatchObject({
        facilityId: 'facility-1',
        status: 'completed',
        changesDetected: 5,
        changesApplied: 5,
      });
      expect(sentData.data.facilities[1]).toMatchObject({
        facilityId: 'facility-2',
        status: 'never_synced',
        lastSyncTime: null,
      });
    });

    it('should send initial FMS sync status for FACILITY_ADMIN (scoped to their facilities)', async () => {
      const client: SubscriptionClient = {
        userId: 'facility-admin-1',
        userRole: UserRole.FACILITY_ADMIN,
        facilityIds: ['facility-1'],
        subscriptions: new Map(),
      };

      mockConfigModel.findByFacilityId.mockResolvedValue({
        id: 'config-1',
        facility_id: 'facility-1',
        is_enabled: true,
      } as any);

      mockSyncLogModel.findLatestByFacilityId.mockResolvedValue({
        id: 'sync-1',
        facility_id: 'facility-1',
        sync_status: 'completed',
        started_at: new Date('2025-01-01T10:00:00Z'),
        completed_at: new Date('2025-01-01T10:05:00Z'),
        changes_detected: 3,
        changes_applied: 3,
      } as any);

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"fms_sync_status_update"')
      );

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities).toHaveLength(1);
      expect(sentData.data.facilities[0].facilityId).toBe('facility-1');
    });

    it('should skip facilities without FMS configured', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      mockConfigModel.findAll.mockResolvedValue([
        {
          id: 'config-1',
          facility_id: 'facility-1',
          is_enabled: true,
        } as any,
      ]);

      mockConfigModel.findByFacilityId.mockResolvedValue(null); // No config

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities).toHaveLength(0);
    });

    it('should skip facilities with disabled FMS', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      mockConfigModel.findAll.mockResolvedValue([
        {
          id: 'config-1',
          facility_id: 'facility-1',
          is_enabled: false, // Disabled
        } as any,
      ]);

      mockConfigModel.findByFacilityId.mockResolvedValue({
        id: 'config-1',
        facility_id: 'facility-1',
        is_enabled: false,
      } as any);

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities).toHaveLength(0);
    });

    it('should handle failed sync status', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      mockConfigModel.findAll.mockResolvedValue([
        { id: 'config-1', facility_id: 'facility-1', is_enabled: true } as any,
      ]);

      mockConfigModel.findByFacilityId.mockResolvedValue({
        id: 'config-1',
        facility_id: 'facility-1',
        is_enabled: true,
      } as any);

      mockSyncLogModel.findLatestByFacilityId.mockResolvedValue({
        id: 'sync-1',
        facility_id: 'facility-1',
        sync_status: 'failed',
        started_at: new Date('2025-01-01T10:00:00Z'),
        completed_at: new Date('2025-01-01T10:05:00Z'),
        error_message: 'Connection timeout',
      } as any);

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities[0]).toMatchObject({
        facilityId: 'facility-1',
        status: 'failed',
        errorMessage: 'Connection timeout',
      });
    });
  });

  describe('broadcastUpdate', () => {
    it('should broadcast FMS sync status update to all subscribed clients', async () => {
      const client1: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      const client2: SubscriptionClient = {
        userId: 'facility-admin-1',
        userRole: UserRole.FACILITY_ADMIN,
        facilityIds: ['facility-1'],
        subscriptions: new Map(),
      };

      const mockWs1 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;
      const mockWs2 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;

      // Add watchers
      const watchers1 = new Set<WebSocket>([mockWs1]);
      const watchers2 = new Set<WebSocket>([mockWs2]);
      (manager as any).watchers.set('sub-1', watchers1);
      (manager as any).watchers.set('sub-2', watchers2);
      (manager as any).clientContext.set('sub-1', client1);
      (manager as any).clientContext.set('sub-2', client2);

      // Mock data for broadcast
      mockConfigModel.findAll.mockResolvedValue([
        { id: 'config-1', facility_id: 'facility-1', is_enabled: true } as any,
      ]);

      mockConfigModel.findByFacilityId.mockResolvedValue({
        id: 'config-1',
        facility_id: 'facility-1',
        is_enabled: true,
      } as any);

      mockSyncLogModel.findLatestByFacilityId.mockResolvedValue({
        id: 'sync-1',
        facility_id: 'facility-1',
        sync_status: 'completed',
        started_at: new Date('2025-01-01T10:00:00Z'),
        completed_at: new Date('2025-01-01T10:05:00Z'),
        changes_detected: 5,
        changes_applied: 5,
      } as any);

      await manager.broadcastUpdate('facility-1');

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();

      const sentData1 = JSON.parse(mockWs1.send.mock.calls[0][0]);
      expect(sentData1.type).toBe('fms_sync_status_update');
      expect(sentData1.data.updatedFacilityId).toBe('facility-1');
    });

    it('should remove closed WebSocket connections during broadcast', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      const mockWsOpen = { send: jest.fn(), readyState: WebSocket.OPEN } as any;
      const mockWsClosed = { send: jest.fn(), readyState: WebSocket.CLOSED } as any;

      const watchers = new Set<WebSocket>([mockWsOpen, mockWsClosed]);
      (manager as any).watchers.set('sub-1', watchers);
      (manager as any).clientContext.set('sub-1', client);

      mockConfigModel.findAll.mockResolvedValue([]);

      await manager.broadcastUpdate();

      expect(mockWsOpen.send).toHaveBeenCalled();
      expect(mockWsClosed.send).not.toHaveBeenCalled();
      expect(watchers.has(mockWsClosed)).toBe(false);
    });

    it('should handle broadcast errors gracefully', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      const mockWs = {
        send: jest.fn().mockImplementation(() => {
          throw new Error('Send failed');
        }),
        readyState: WebSocket.OPEN,
      } as any;

      const watchers = new Set<WebSocket>([mockWs]);
      (manager as any).watchers.set('sub-1', watchers);
      (manager as any).clientContext.set('sub-1', client);

      mockConfigModel.findAll.mockResolvedValue([]);

      // Should not throw
      await expect(manager.broadcastUpdate()).resolves.not.toThrow();

      // Should remove broken connection
      expect(watchers.has(mockWs)).toBe(false);
    });
  });

  describe('Data Scoping - RBAC', () => {
    it('should only return facilities accessible to FACILITY_ADMIN', async () => {
      const client: SubscriptionClient = {
        userId: 'facility-admin-1',
        userRole: UserRole.FACILITY_ADMIN,
        facilityIds: ['facility-1', 'facility-2'],
        subscriptions: new Map(),
      };

      mockConfigModel.findByFacilityId
        .mockResolvedValueOnce({
          id: 'config-1',
          facility_id: 'facility-1',
          is_enabled: true,
        } as any)
        .mockResolvedValueOnce({
          id: 'config-2',
          facility_id: 'facility-2',
          is_enabled: true,
        } as any);

      mockSyncLogModel.findLatestByFacilityId
        .mockResolvedValueOnce({
          id: 'sync-1',
          facility_id: 'facility-1',
          sync_status: 'completed',
          started_at: new Date('2025-01-01T10:00:00Z'),
          completed_at: new Date('2025-01-01T10:05:00Z'),
        } as any)
        .mockResolvedValueOnce({
          id: 'sync-2',
          facility_id: 'facility-2',
          sync_status: 'completed',
          started_at: new Date('2025-01-01T11:00:00Z'),
          completed_at: new Date('2025-01-01T11:05:00Z'),
        } as any);

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities).toHaveLength(2);
      expect(sentData.data.facilities.map((f: any) => f.facilityId)).toEqual([
        'facility-1',
        'facility-2',
      ]);
    });

    it('should return all facilities for ADMIN', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        facilityIds: [],
        subscriptions: new Map(),
      };

      mockConfigModel.findAll.mockResolvedValue([
        { id: 'config-1', facility_id: 'facility-1', is_enabled: true } as any,
        { id: 'config-2', facility_id: 'facility-2', is_enabled: true } as any,
        { id: 'config-3', facility_id: 'facility-3', is_enabled: true } as any,
      ]);

      mockConfigModel.findByFacilityId.mockResolvedValue({
        is_enabled: true,
      } as any);

      mockSyncLogModel.findLatestByFacilityId.mockResolvedValue(null);

      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      const sentData = JSON.parse(mockWs.send.mock.calls[0]?.[0] as string);
      expect(sentData.data.facilities).toHaveLength(3);
    });
  });
});
