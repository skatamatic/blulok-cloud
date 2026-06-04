jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      connection: {
        raw: jest.fn((_sql: string, bindings?: unknown[]) => ({ sql: _sql, bindings })),
      },
    }),
  },
}));

jest.mock('@/models/key-sharing.model');
jest.mock('@/models/denylist-entry.model');
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(),
  },
}));
jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistAdd: jest.fn().mockResolvedValue(false),
  },
}));
jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistAdd: jest.fn().mockResolvedValue('mock-denylist-add-jwt'),
  },
}));
jest.mock('@/config/environment', () => ({
  config: {
    security: {
      routePassTtlHours: 24,
    },
  },
}));
jest.mock('@/services/access-control-zone-access.service', () => ({
  AccessControlZoneAccessService: {
    getDenylistDeviceIdsForUnits: jest.fn(),
    getDeviceFacilityIds: jest.fn(),
  },
}));

import { KeySharingService } from '@/services/key-sharing.service';
import { KeySharingModel } from '@/models/key-sharing.model';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { DenylistService } from '@/services/denylist.service';
import { AccessControlZoneAccessService } from '@/services/access-control-zone-access.service';
import { UserRole } from '@/types/auth.types';

describe('KeySharingService.revokeShare denylist targeting', () => {
  let mockKeySharings: jest.Mocked<KeySharingModel>;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;
  let mockGateway: { unicastToFacility: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockKeySharings = {
      findById: jest.fn().mockResolvedValue({
        id: 'share-1',
        unit_id: 'unit-1',
        primary_tenant_id: 'owner-1',
        shared_with_user_id: 'invitee-1',
      }),
      revokeSharing: jest.fn().mockResolvedValue(true),
    } as any;
    (KeySharingModel as jest.MockedClass<typeof KeySharingModel>).mockImplementation(() => mockKeySharings);

    mockDenylistModel = {
      bulkCreate: jest.fn().mockResolvedValue(undefined),
    } as any;
    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

    mockGateway = { unicastToFacility: jest.fn() };
    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue(mockGateway);

    (AccessControlZoneAccessService.getDenylistDeviceIdsForUnits as jest.Mock).mockResolvedValue(['lock-1']);
    (AccessControlZoneAccessService.getDeviceFacilityIds as jest.Mock).mockResolvedValue(
      new Map([['lock-1', 'fac-1']]),
    );

    (KeySharingService as any).instance = undefined;
  });

  it('denylists only bluLok locks (not access_control IDs)', async () => {
    const service = KeySharingService.getInstance();

    await service.revokeShare(
      { userId: 'admin-1', role: UserRole.ADMIN },
      'share-1',
      'admin-1',
    );

    expect(AccessControlZoneAccessService.getDenylistDeviceIdsForUnits).toHaveBeenCalledWith(['unit-1']);
    expect(mockDenylistModel.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        device_id: 'lock-1',
        user_id: 'invitee-1',
        source: 'key_sharing_revocation',
      }),
    ]);
    expect(DenylistService.buildDenylistAdd).toHaveBeenCalledWith(
      [{ sub: 'invitee-1', exp: expect.any(Number) }],
      ['lock-1'],
    );
    expect(mockGateway.unicastToFacility).toHaveBeenCalledWith('fac-1', 'mock-denylist-add-jwt');
  });
});
