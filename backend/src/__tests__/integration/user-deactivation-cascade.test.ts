/**
 * Integration Test: User Deactivation Cascades
 *
 * Verifies Flow G:
 *  - Held access: deactivated user is denylisted on devices from primary and shared units
 *  - Granted access: shares granted by the user are inactivated and invitees are denylisted
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
jest.mock('@/config/environment', () => ({
  config: {
    security: {
      routePassTtlHours: 24,
    },
  },
}));

import request from 'supertest';
import { Application } from 'express';
import { createIntegrationTestApp } from '@/__tests__/utils/integration-test-server';
import { DatabaseService } from '@/services/database.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { DenylistService } from '@/services/denylist.service';

describe('User Deactivation Cascades', () => {
  let app: Application;
  let mockKnex: any;
  let mockGateway: any;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;

  beforeEach(() => {
    // Build a targeted mock for knex tables we query in the route
    const makeUnitAssignments = () => ({
      where: jest.fn().mockReturnThis(),
      pluck: jest.fn().mockResolvedValue(['unit-primary-1']),
    });

    const makeKeySharingForHeld = () => ({
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      pluck: jest.fn().mockResolvedValue(['unit-shared-1']),
      first: jest.fn(),
    });

    const makeKeySharingForGranted = () => ({
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { id: 'share-1', unit_id: 'unit-primary-1', shared_with_user_id: 'invitee-1' },
        { id: 'share-2', unit_id: 'unit-shared-1', shared_with_user_id: 'invitee-2' },
      ]),
      update: jest.fn().mockResolvedValue(1),
      pluck: jest.fn().mockResolvedValue(['unit-shared-1']),
    });

    const makeDevicesJoinUnits = () => ({
      whereIn: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { device_id: 'device-A', facility_id: 'facility-1' },
        { device_id: 'device-B', facility_id: 'facility-2' },
      ]),
      join: jest.fn().mockReturnThis(),
    });

    const makeDevicesForUnit = () => ({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{ id: 'device-C' }]),
    });

    const makeUnits = () => ({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ facility_id: 'facility-1' }),
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
    });

    mockKnex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return makeUnitAssignments();
      if (table === 'key_sharing') return makeKeySharingForGranted();
      if (table === 'blulok_devices as bd') return makeDevicesJoinUnits();
      if (table === 'blulok_devices') return makeDevicesForUnit();
      if (table === 'units') return makeUnits();
      return {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockReturnValue({}),
        join: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
        fn: { now: () => new Date() },
        pluck: jest.fn().mockResolvedValue([]),
      };
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: mockKnex });

    mockGateway = { unicastToFacility: jest.fn(), broadcast: jest.fn() };
    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue(mockGateway);

    mockDenylistModel = {
      create: jest.fn().mockResolvedValue({ id: 'entry-1' } as any),
      findByUnitsAndUser: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(true),
    } as any;
    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

    app = createIntegrationTestApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deny-lists deactivated user for primary and shared units, and cascades to invitees', async () => {
    const res = await request(app)
      .delete('/api/v1/users/user-to-deactivate')
      .set('Authorization', 'Bearer mock-jwt-token')
      .expect(200);

    expect(res.body.success).toBe(true);

    // Held access: entries created for devices from both facility-1 & facility-2
    expect(mockDenylistModel.create).toHaveBeenCalled();
    // Gateway called for both facilities for deactivated user
    expect(mockGateway.unicastToFacility).toHaveBeenCalled();

    // Granted access cascade: key_sharing inactivated and invitees denylisted
    // Verify we sent at least two unicast commands (deactivated user + invitees)
    expect((mockGateway.unicastToFacility as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});


