jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({ connection: jest.fn() }),
  },
}));
jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    findByUnitsAndUser: jest.fn().mockResolvedValue([]),
    remove: jest.fn(),
  })),
}));
const sendInviteMock = jest.fn();
jest.mock('@/services/first-time-user.service', () => ({
  FirstTimeUserService: {
    getInstance: () => ({ sendInvite: sendInviteMock }),
  },
}));
const addUserToFacilityMock = jest.fn();
jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    addUserToFacility: addUserToFacilityMock,
  },
}));

import { KeySharingService } from '@/services/key-sharing.service';
import { UserModel } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';

describe('KeySharingService.inviteByPhone SMS behavior', () => {
  let svc: KeySharingService;

  beforeEach(() => {
    (KeySharingService as any).instance = undefined;
    svc = KeySharingService.getInstance();
    sendInviteMock.mockReset();
    addUserToFacilityMock.mockReset();
  });

  it('sends invite SMS when creating a brand new user by phone', async () => {
    // No existing user; create + invite
    (UserModel.findByPhone as any) = jest.fn().mockResolvedValue(undefined);
    (UserModel.create as any) = jest.fn().mockResolvedValue({
      id: 'new-user-id',
      phone_number: '+15551230000',
    });
    // Stub DB lookup for unit → facility mapping
    const unitsWhere = jest.fn().mockReturnThis();
    const unitsFirst = jest.fn().mockResolvedValue({ facility_id: 'facility-1' });
    (svc as any).db = jest.fn(() => ({
      where: unitsWhere,
      first: unitsFirst,
    }));

    const res = await svc.inviteByPhone({
      unitId: 'unit-1',
      phoneE164: '+15551230000',
      accessLevel: 'limited',
      expiresAt: null,
      grantedBy: 'admin-1',
    });

    expect(res.shareId).toBeDefined();
    expect(sendInviteMock).toHaveBeenCalledTimes(1);
    // Ensure new user was associated to the unit's facility
    expect((svc as any).db).toHaveBeenCalledWith('units');
    expect(unitsWhere).toHaveBeenCalledWith({ id: 'unit-1' });
    expect(unitsFirst).toHaveBeenCalledWith('facility_id');
    expect(addUserToFacilityMock).toHaveBeenCalledWith('new-user-id', 'facility-1');
  });

  it('sends invite SMS for existing user that still requires password reset', async () => {
    (UserModel.findByPhone as any) = jest.fn().mockResolvedValue({
      id: 'existing-user-id',
      phone_number: '+15551230001',
      requires_password_reset: true,
    });

    const res = await svc.inviteByPhone({
      unitId: 'unit-1',
      phoneE164: '+15551230001',
      accessLevel: 'limited',
      expiresAt: null,
      grantedBy: 'admin-1',
    });

    expect(res.shareId).toBeDefined();
    expect(sendInviteMock).toHaveBeenCalledTimes(1);
  });
});


