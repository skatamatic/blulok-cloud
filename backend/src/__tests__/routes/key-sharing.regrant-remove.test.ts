jest.mock('@/services/database.service');
jest.mock('@/models/denylist-entry.model');
jest.mock('@/services/gateway/gateway-events.service');
jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    // Mock JWT string for denylist remove command (inline to avoid hoisting issues)
    buildDenylistRemove: jest.fn().mockResolvedValue('eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJCbHVDbG91ZDpSb290IiwiY21kX3R5cGUiOiJERU5ZTElTVF9SRU1PVkUiLCJkZW55bGlzdF9yZW1vdmUiOltdfQ.mock-sig'),
  },
}));
jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistRemove: jest.fn().mockReturnValue(false),
  },
}));

import request from 'supertest';
import { createIntegrationTestApp } from '@/__tests__/utils/integration-test-server';
import { DatabaseService } from '@/services/database.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { DenylistService } from '@/services/denylist.service';

describe('Key Sharing Re-grant triggers denylist removal', () => {
  let app: any;
  let mockKnex: any;
  let mockGateway: any;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;

  beforeEach(() => {
    const keySharingTable = () => {
      const existing = {
        id: 'share-1',
        unit_id: 'unit-1',
        primary_tenant_id: 'owner-1',
        shared_with_user_id: 'invitee-1',
        is_active: false,
        expires_at: null,
      };
      return {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(1),
      };
    };

    const devicesJoinUnits = () => ({
      whereIn: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{ device_id: 'device-1', facility_id: 'facility-1' }]),
    });

    mockKnex = jest.fn((table: string) => {
      if (table === 'key_sharing') return keySharingTable();
      if (table === 'blulok_devices as bd') return devicesJoinUnits();
      return {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn(),
        fn: { now: () => new Date() },
      };
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: mockKnex });

    mockDenylistModel = {
      findByUnitsAndUser: jest.fn().mockResolvedValue([
        { id: 'e1', device_id: 'device-1', user_id: 'invitee-1', expires_at: new Date(Date.now() + 3600_000) } as any,
      ]),
      remove: jest.fn().mockResolvedValue(true),
      bulkRemove: jest.fn().mockResolvedValue(1),
    } as any;
    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

    mockGateway = { unicastToFacility: jest.fn(), broadcast: jest.fn() };
    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue(mockGateway);

    app = createIntegrationTestApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('removes denylist entries and sends DENYLIST_REMOVE when is_active toggled to true', async () => {
    const res = await request(app)
      .put('/api/v1/key-sharing/share-1')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ is_active: true })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockDenylistModel.findByUnitsAndUser).toHaveBeenCalledWith(['unit-1'], 'invitee-1');
    expect(DenylistService.buildDenylistRemove).toHaveBeenCalled();
    // Now expects JWT string instead of object
    expect(mockGateway.unicastToFacility).toHaveBeenCalledWith('facility-1', expect.stringContaining('.'));
    // Now uses bulkRemove instead of remove for efficiency
    expect(mockDenylistModel.bulkRemove).toHaveBeenCalledWith(['device-1'], 'invitee-1');
  });
});


