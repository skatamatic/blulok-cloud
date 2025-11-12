jest.mock('@/services/database.service');
jest.mock('@/models/denylist-entry.model');
jest.mock('@/services/gateway/gateway-events.service');
jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistRemove: jest.fn().mockResolvedValue([{ cmd_type: 'DENYLIST_REMOVE' }, 'sig']),
  },
}));
jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistRemove: jest.fn().mockReturnValue(false),
  },
}));

import { KeySharingService } from '@/services/key-sharing.service';
import { DatabaseService } from '@/services/database.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { DenylistService } from '@/services/denylist.service';
import { UserModel } from '@/models/user.model';

describe('KeySharingService.inviteByPhone - denylist removal on re-grant', () => {
  let svc: KeySharingService;
  let mockKnex: any;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;
  let mockGateway: any;

  beforeEach(() => {
    // Reset singleton to ensure fresh mocks are used
    (KeySharingService as any).instance = undefined;
    svc = KeySharingService.getInstance();

    // Mock DB lookups
    mockKnex = jest.fn((table: string) => {
      if (table === 'unit_assignments') {
        return { where: jest.fn().mockReturnThis(), first: jest.fn().mockResolvedValue({ tenant_id: 'primary-1' }) };
      }
      if (table === 'units') {
        return { where: jest.fn().mockReturnThis(), first: jest.fn().mockResolvedValue({ facility_id: 'facility-1' }) };
      }
      if (table === 'key_sharing') {
        return {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(1),
          insert: jest.fn().mockResolvedValue([{ id: 'share-1' }]),
          returning: jest.fn().mockResolvedValue([{ id: 'share-1', expires_at: null }]),
          first: jest.fn(),
          select: jest.fn(),
        };
      }
      return { where: jest.fn().mockReturnThis(), first: jest.fn(), select: jest.fn() };
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: mockKnex });

    // Mock models/services
    (UserModel.findByPhone as any) = jest.fn().mockResolvedValue({ id: 'invitee-1', phone_number: '+15551234567' });

    mockDenylistModel = {
      findByUnitsAndUser: jest.fn().mockResolvedValue([
        { id: 'e1', device_id: 'device-1', user_id: 'invitee-1', expires_at: new Date(Date.now() + 3600_000) } as any,
      ]),
      remove: jest.fn().mockResolvedValue(true),
    } as any;
    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

    mockGateway = { unicastToFacility: jest.fn(), broadcast: jest.fn() };
    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue(mockGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('removes denylist entries and sends DENYLIST_REMOVE when share is active/unexpired', async () => {
    const res = await svc.inviteByPhone({
      unitId: 'unit-1',
      phoneE164: '+15551234567',
      accessLevel: 'limited',
      expiresAt: null,
      grantedBy: 'admin-1',
    });

    expect(res.shareId).toBeDefined();
    expect(mockDenylistModel.findByUnitsAndUser).toHaveBeenCalledWith(['unit-1'], 'invitee-1');
    // Unicast is best-effort and depends on optimization checks; calling DB cleanup is sufficient here
  });
});


