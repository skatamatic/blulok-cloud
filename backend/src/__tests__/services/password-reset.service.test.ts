import { PasswordResetService } from '@/services/password-reset.service';
import { DatabaseService } from '@/services/database.service';
import { OTPService } from '@/services/otp.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { UserModel } from '@/models/user.model';

// Mock dependencies
jest.mock('@/services/database.service');
jest.mock('@/services/otp.service');
jest.mock('@/services/notifications/notification.service');
jest.mock('@/models/user.model');
jest.mock('@/utils/phone.util', () => ({
  toE164: jest.fn((phone: string) => phone.startsWith('+') ? phone : `+1${phone}`),
}));

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let mockDb: any;
  let mockOtpService: jest.Mocked<OTPService>;
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

    // Mock OTPService
    mockOtpService = {
      sendOtp: jest.fn().mockResolvedValue({ expiresAt: new Date() }),
      verifyOtp: jest.fn().mockResolvedValue({ valid: true }),
    } as any;

    (OTPService.getInstance as jest.Mock).mockReturnValue(mockOtpService);

    // Mock NotificationService
    mockNotificationService = {
      getConfig: jest.fn().mockResolvedValue({
        enabledChannels: { sms: true, email: true },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {},
      }),
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
    it('should send OTP via SMS when user has phone and SMS is enabled', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      mockQueryBuilder.first.mockResolvedValue(null); // No previous OTP

      const result = await service.requestReset({ email: 'test@example.com' });

      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('userId', mockUser.id);
      expect(result).toHaveProperty('deliveryMethod', 'sms');
      expect(mockOtpService.sendOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          delivery: 'sms',
          toPhone: mockUser.phone_number,
          kind: 'password_reset',
        })
      );
    });

    it('should send OTP via email when SMS is disabled', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, phone_number: null });
      mockQueryBuilder.first.mockResolvedValue(null);
      mockNotificationService.getConfig.mockResolvedValue({
        enabledChannels: { sms: false, email: true },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {},
      });

      const result = await service.requestReset({ email: 'test@example.com' });

      expect(result.deliveryMethod).toBe('email');
      expect(mockOtpService.sendOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          delivery: 'email',
          toEmail: mockUser.email,
          kind: 'password_reset',
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

    it('should enforce resend throttle', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      
      // Mock recent OTP sent
      mockQueryBuilder.first.mockResolvedValue({
        last_sent_at: new Date(), // Just now
      });

      await expect(service.requestReset({ email: 'test@example.com' }))
        .rejects.toThrow('Please wait before requesting another code');
    });
  });

  describe('resetPassword', () => {
    it('should reset password when OTP is valid', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      mockOtpService.verifyOtp.mockResolvedValue({ valid: true });

      const result = await service.resetPassword({
        email: 'test@example.com',
        otp: '123456',
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(true);
      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith({
        userId: mockUser.id,
        inviteId: null,
        code: '123456',
      });
      expect(mockQueryBuilder.update).toHaveBeenCalled();
    });

    it('should throw error when OTP is invalid', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      mockOtpService.verifyOtp.mockResolvedValue({ valid: false });

      await expect(service.resetPassword({
        email: 'test@example.com',
        otp: '000000',
        newPassword: 'NewPassword123!',
      })).rejects.toThrow('Invalid or expired verification code');
    });

    it('should throw error when user not found', async () => {
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(service.resetPassword({
        email: 'nonexistent@example.com',
        otp: '123456',
        newPassword: 'NewPassword123!',
      })).rejects.toThrow('User not found');
    });

    it('should throw error when user is inactive', async () => {
      const inactiveUser = { ...mockUser, is_active: false };
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(inactiveUser);

      await expect(service.resetPassword({
        email: 'test@example.com',
        otp: '123456',
        newPassword: 'NewPassword123!',
      })).rejects.toThrow('Account is not active');
    });
  });
});
