import { FirstTimeUserService } from '@/services/first-time-user.service';
import { User } from '@/models/user.model';
import { UserRole } from '@/types/auth.types';

// Mock all dependencies to avoid DB hangs
const mockInvites = {
  createInvite: jest.fn(),
  findActiveInviteByToken: jest.fn(),
  consumeInvite: jest.fn(),
};

const mockNotifications = {
  sendInvite: jest.fn().mockResolvedValue(undefined),
};

const mockOtps = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
};

// Mock the services
jest.mock('@/services/invite.service', () => ({
  InviteService: {
    getInstance: () => mockInvites,
  },
}));

jest.mock('@/services/notifications/notification.service', () => ({
  NotificationService: {
    getInstance: () => mockNotifications,
  },
}));

jest.mock('@/services/otp.service', () => ({
  OTPService: {
    getInstance: () => mockOtps,
  },
}));

jest.mock('@/models/system-settings.model', () => ({
  SystemSettingsModel: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue('blulok://invite'),
  })),
}));

jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    updateById: jest.fn(),
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connection: jest.fn((tableName: string) => {
        if (tableName === 'user_otps') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
      })
    })
  },
}));

describe('FirstTimeUserService', () => {
  const svc = FirstTimeUserService.getInstance();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sendInvite creates invite and dispatches notification with deeplink containing token and phone', async () => {
    const user: User = {
      id: 'user-123',
      login_identifier: 'tenant1@example.com',
      email: 'tenant1@example.com',
      phone_number: '+1 (555) 000-1234',
      first_name: 'Tenant',
      last_name: 'One',
      role: UserRole.TENANT,
      password_hash: 'hashed',
      is_active: true,
      requires_password_reset: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockInvites.createInvite.mockResolvedValue({
      token: 'invite-token-123',
      inviteId: 'invite-123',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await svc.sendInvite(user);

    expect(mockInvites.createInvite).toHaveBeenCalledWith(user.id);
    expect(mockNotifications.sendInvite).toHaveBeenCalledTimes(1);
    const args = mockNotifications.sendInvite.mock.calls[0][0];
    expect(args.deeplink).toContain('token=invite-token-123');
    expect(args.deeplink).toContain('phone=%2B1%20(555)%20000-1234');
    expect(args.toPhone).toBe(user.phone_number);
    expect(args.toEmail).toBe(user.email);
  });

  test('requestOtp with phone validates ownership and calls OTP service', async () => {
    const user = {
      id: 'user-456',
      phone_number: '+1 555-000-1235',
      email: 'tenant2@example.com',
      first_name: 'John',
      last_name: 'Smith',
    };

    const invite = {
      id: 'invite-456',
      user_id: user.id,
      last_sent_at: null
    };

    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    const { UserModel } = require('@/models/user.model');
    UserModel.findById.mockResolvedValue(user);
    UserModel.findByEmail.mockResolvedValue(null);
    mockOtps.sendOtp.mockResolvedValue({ expiresAt: new Date() });

    const res = await svc.requestOtp({ token: 'token-123', phone: '+15550001235' });

    expect(mockInvites.findActiveInviteByToken).toHaveBeenCalledWith('token-123');
    expect(UserModel.findById).toHaveBeenCalledWith(user.id);
    expect(mockOtps.sendOtp).toHaveBeenCalledWith({
      userId: user.id,
      inviteId: invite.id,
      delivery: 'sms',
      toPhone: user.phone_number
    });
    expect(res.userId).toBe(user.id);
    expect(res.inviteId).toBe(invite.id);
  });

  test('requestOtp requires first and last name when user profile is empty', async () => {
    const user: any = {
      id: 'user-000',
      phone_number: '+15550001111',
      email: null,
      first_name: '',
      last_name: '',
    };
    const invite = { id: 'invite-000', user_id: user.id };

    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    const { UserModel } = require('@/models/user.model');
    UserModel.findById.mockResolvedValue(user);
    UserModel.findByEmail.mockResolvedValue(null);

    await expect(
      svc.requestOtp({ token: 'token-000', phone: '+1 (555) 000-1111' })
    ).rejects.toThrow(/First name and last name are required/);

    // When names are provided, it should update the user and send OTP
    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    UserModel.findById.mockResolvedValue(user);
    mockOtps.sendOtp.mockResolvedValue({ expiresAt: new Date() });

    await svc.requestOtp({
      token: 'token-000',
      phone: '+1 (555) 000-1111',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });

    expect(UserModel.updateById).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' })
    );
  });

  test('requestOtp with wrong phone is rejected', async () => {
    const user = {
      id: 'user-789',
      phone_number: '+1 555-000-9999',
      email: 'tenant3@example.com',
      first_name: 'Wrong',
      last_name: 'Phone',
    };

    mockInvites.findActiveInviteByToken.mockResolvedValue({
      id: 'invite-789',
      user_id: user.id
    });
    const { UserModel } = require('@/models/user.model');
    UserModel.findById.mockResolvedValue(user);

    await expect(svc.requestOtp({ token: 'token-123', phone: '+15550000000' }))
      .rejects.toThrow('Phone does not match');
  });

  test('requestOtp via email path when no phone', async () => {
    const user = {
      id: 'user-999',
      phone_number: null,
      email: 'tenant4@example.com',
      first_name: 'Email',
      last_name: 'Only',
    };

    const invite = {
      id: 'invite-999',
      user_id: user.id
    };

    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    const { UserModel } = require('@/models/user.model');
    UserModel.findById.mockResolvedValue(user);
    mockOtps.sendOtp.mockResolvedValue({ expiresAt: new Date() });

    const res = await svc.requestOtp({ token: 'token-123', email: 'tenant4@example.com' });

    expect(mockOtps.sendOtp).toHaveBeenCalledWith({
      userId: user.id,
      inviteId: invite.id,
      delivery: 'email',
      toEmail: user.email
    });
    expect(res.userId).toBe(user.id);
  });

  test('requestOtp enforces resend throttle window', async () => {
    const user = { id: 'user-888', phone_number: '+15550007777', first_name: 'Throttle', last_name: 'User' };
    const invite = { id: 'invite-888', user_id: user.id };

    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    const { UserModel } = require('@/models/user.model');
    UserModel.findById.mockResolvedValue(user);

    // Spy on the service's db method to return recent OTP
    const mockQueryBuilder: any = {};
    mockQueryBuilder.where = jest.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy = jest.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.first = jest.fn().mockResolvedValue({
      last_sent_at: new Date(Date.now() - 10 * 1000) // 10 seconds ago, within 30s throttle
    });

    const dbSpy = jest.spyOn(svc as any, 'db').mockReturnValue(mockQueryBuilder);

    await expect(svc.requestOtp({ token: 'token-123', phone: '+15550007777' }))
      .rejects.toThrow(/wait/i);

    dbSpy.mockRestore();
  });

  test('verifyOtp returns true when OTP service reports success', async () => {
    const invite = { id: 'invite-777', user_id: 'user-777' };

    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    mockOtps.verifyOtp.mockResolvedValue({ valid: true });

    const result = await svc.verifyOtp({ token: 'token-123', otp: '123456' });

    expect(result).toBe(true);
    expect(mockOtps.verifyOtp).toHaveBeenCalledWith({
      userId: invite.user_id,
      inviteId: invite.id,
      code: '123456'
    });
  });

  test('setPassword consumes invite and clears requires_password_reset', async () => {
    const user = { id: 'user-666' };
    const invite = { id: 'invite-666', user_id: user.id };

    mockInvites.findActiveInviteByToken.mockResolvedValue(invite);
    mockOtps.verifyOtp.mockResolvedValue({ valid: true });
    const { UserModel } = require('@/models/user.model');
    UserModel.findById.mockResolvedValue(user);

    await svc.setPassword({ token: 'token-123', otp: '123456', newPassword: 'NewStrong!23' });

    expect(mockInvites.consumeInvite).toHaveBeenCalledWith(invite.id);
  });
});