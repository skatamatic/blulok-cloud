import { PasswordResetService } from '@/services/password-reset.service';
import { DatabaseService } from '@/services/database.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { UserModel } from '@/models/user.model';

// Mock dependencies
jest.mock('@/services/database.service');
jest.mock('@/services/notifications/notification.service');
jest.mock('@/models/user.model');
jest.mock('@/utils/phone.util', () => ({
  toE164: jest.fn((phone: string) => phone.startsWith('+') ? phone : `+1${phone}`),
}));

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let mockDb: any;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockQueryBuilder: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    phone_number: '+15551234567',
    is_active: true,
    first_name: 'Test',
    last_name: 'User',
  };

  const mockToken = {
    id: 'token-123',
    user_id: 'user-123',
    token: 'test-reset-token-abc123',
    expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
    used_at: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock query builder
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      fn: { now: jest.fn(() => new Date()) },
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    mockDb.fn = { now: jest.fn(() => new Date()) };

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockDb,
    });

    // Mock NotificationService
    mockNotificationService = {
      getConfig: jest.fn().mockResolvedValue({
        enabledChannels: { sms: true, email: true },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {},
        deeplinkBaseUrl: 'blulok://',
      }),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    } as any;

    (NotificationService.getInstance as jest.Mock).mockReturnValue(mockNotificationService);

    // Reset singleton
    (PasswordResetService as any).instance = undefined;
    service = PasswordResetService.getInstance();
  });

  afterEach(() => {
    // Clean up singleton after each test
    (PasswordResetService as any).instance = undefined;
  });

  describe('requestReset', () => {
    it('should generate token and send SMS when user has phone', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.requestReset({ email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('deliveryMethod', 'sms');
      
      // Should invalidate old tokens
      expect(mockDb).toHaveBeenCalledWith('password_reset_tokens');
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      
      // Should insert new token
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      
      // Should send notification
      expect(mockNotificationService.sendPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
          toPhone: mockUser.phone_number,
        })
      );
    });

    it('should send email when SMS is disabled but email is enabled', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, phone_number: null });
      mockNotificationService.getConfig.mockResolvedValue({
        enabledChannels: { sms: false, email: true },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {},
        deeplinkBaseUrl: 'blulok://',
      });

      const result = await service.requestReset({ email: 'test@example.com' });

      expect(result.deliveryMethod).toBe('email');
      expect(mockNotificationService.sendPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: mockUser.email,
        })
      );
    });

    it('should throw error when user is not found', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(service.requestReset({ email: 'nonexistent@example.com' }))
        .rejects.toThrow('If an account exists');
    });

    it('should throw error when user is inactive', async () => {
      const inactiveUser = { ...mockUser, is_active: false };
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(inactiveUser);

      await expect(service.requestReset({ email: 'test@example.com' }))
        .rejects.toThrow('Account is not active');
    });

    it('should throw error when no email or phone provided', async () => {
      await expect(service.requestReset({}))
        .rejects.toThrow('Email or phone is required');
    });
  });

  describe('verifyToken', () => {
    it('should return valid for unexpired unused token', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockToken);
      (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.verifyToken('test-reset-token-abc123');

      expect(result.valid).toBe(true);
      expect(result.userId).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should return invalid for non-existent token', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await service.verifyToken('invalid-token');

      expect(result.valid).toBe(false);
    });

    it('should return invalid for inactive user', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockToken);
      (UserModel.findById as jest.Mock).mockResolvedValue({ ...mockUser, is_active: false });

      const result = await service.verifyToken('test-reset-token-abc123');

      expect(result.valid).toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('should reset password when token is valid', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockToken);
      (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.resetPassword({
        token: 'test-reset-token-abc123',
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(true);
      
      // Should mark token as used and update user password
      expect(mockQueryBuilder.update).toHaveBeenCalledTimes(2);
    });

    it('should throw error when token is invalid', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(service.resetPassword({
        token: 'invalid-token',
        newPassword: 'NewPassword123!',
      })).rejects.toThrow('Invalid or expired reset link');
    });

    it('should throw error when user not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockToken);
      (UserModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.resetPassword({
        token: 'test-reset-token-abc123',
        newPassword: 'NewPassword123!',
      })).rejects.toThrow('User not found');
    });

    it('should throw error when user is inactive', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockToken);
      (UserModel.findById as jest.Mock).mockResolvedValue({ ...mockUser, is_active: false });

      await expect(service.resetPassword({
        token: 'test-reset-token-abc123',
        newPassword: 'NewPassword123!',
      })).rejects.toThrow('Account is not active');
    });
  });
});
