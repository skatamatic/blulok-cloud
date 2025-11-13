/**
 * Integration Test: User Reactivation Restores Access
 *
 * Verifies:
 *  - Owner denylist entries are removed and remove commands sent
 *  - Previously deactivated shares are reactivated (best-effort)
 */

jest.mock('@/services/database.service');
jest.mock('@/models/denylist-entry.model');
jest.mock('@/services/gateway/gateway-events.service');
jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistAdd: jest.fn().mockResolvedValue([{ cmd_type: 'DENYLIST_ADD' }, 'sig']),
    buildDenylistRemove: jest.fn().mockResolvedValue([{ cmd_type: 'DENYLIST_REMOVE' }, 'sig']),
  },
}));
jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistAdd: jest.fn().mockResolvedValue(false),
    shouldSkipDenylistRemove: jest.fn().mockReturnValue(false),
  },
}));

import request from 'supertest';
import { Application } from 'express';
import { createIntegrationTestApp } from '@/__tests__/utils/integration-test-server';
import { DatabaseService } from '@/services/database.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { DenylistService } from '@/services/denylist.service';

describe('User Reactivation Restores Access', () => {
  let app: Application;
  let mockKnex: any;
  let mockGateway: any;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;

  beforeEach(() => {
    const devicesJoinUnits = () => ({
      whereIn: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { device_id: 'device-A', facility_id: 'facility-1' },
        { device_id: 'device-B', facility_id: 'facility-1' },
      ]),
    });

    const keySharing = () => ({
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(2),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
    });

    mockKnex = jest.fn((table: string) => {
      if (table === 'blulok_devices as bd') return devicesJoinUnits();
      if (table === 'key_sharing') return keySharing();
      return {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn(),
        fn: { now: () => new Date() },
      };
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: mockKnex });

    mockGateway = { unicastToFacility: jest.fn(), broadcast: jest.fn() };
    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue(mockGateway);

    mockDenylistModel = {
      findByUser: jest.fn().mockResolvedValue([
        { id: 'e1', device_id: 'device-A', user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000) } as any,
        { id: 'e2', device_id: 'device-B', user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000) } as any,
      ]),
      remove: jest.fn().mockResolvedValue(true),
    } as any;
    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

    app = createIntegrationTestApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('removes owner denylist entries and sends DENYLIST_REMOVE on activation', async () => {
    const res = await request(app)
      .post('/api/v1/users/user-1/activate')
      .set('Authorization', 'Bearer mock-jwt-token')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockDenylistModel.findByUser).toHaveBeenCalledWith('user-1');
    expect(DenylistService.buildDenylistRemove).toHaveBeenCalled();
    expect(mockGateway.unicastToFacility).toHaveBeenCalledWith('facility-1', expect.objectContaining({ cmd_type: 'DENYLIST_REMOVE' }));
    expect(mockDenylistModel.remove).toHaveBeenCalledTimes(2);
  });
});


