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

import { KeySharingService } from '@/services/key-sharing.service';
import { UserModel } from '@/models/user.model';

describe('KeySharingService.inviteByPhone SMS behavior', () => {
  let svc: KeySharingService;

  beforeEach(() => {
    (KeySharingService as any).instance = undefined;
    svc = KeySharingService.getInstance();
    sendInviteMock.mockReset();
  });

  it('sends invite SMS when creating a brand new user by phone', async () => {
    // No existing user; create + invite
    (UserModel.findByPhone as any) = jest.fn().mockResolvedValue(undefined);

    const res = await svc.inviteByPhone({
      unitId: 'unit-1',
      phoneE164: '+15551230000',
      accessLevel: 'limited',
      expiresAt: null,
      grantedBy: 'admin-1',
    });

    expect(res.shareId).toBeDefined();
    expect(sendInviteMock).toHaveBeenCalledTimes(1);
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


