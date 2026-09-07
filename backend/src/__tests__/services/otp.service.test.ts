import { NotificationService } from '@/services/notifications/notification.service';
import { OTPService } from '@/services/otp.service';

describe('OTPService', () => {
  let sendOtpSpy: jest.SpyInstance;

  beforeEach(() => {
    (OTPService as unknown as { instance?: OTPService }).instance = undefined;
    sendOtpSpy = jest
      .spyOn(NotificationService.getInstance(), 'sendOtp')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    sendOtpSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('sendOtp', () => {
    it('throws when delivery is sms but toPhone is missing', async () => {
      const svc = OTPService.getInstance();
      await expect(
        svc.sendOtp({
          userId: 'user-1',
          delivery: 'sms',
        })
      ).rejects.toThrow('Invalid OTP delivery parameters');
    });

    it('throws when delivery is email but toEmail is missing', async () => {
      const svc = OTPService.getInstance();
      await expect(
        svc.sendOtp({
          userId: 'user-1',
          delivery: 'email',
        })
      ).rejects.toThrow('Invalid OTP delivery parameters');
    });

    it('dispatches SMS notification when sms + phone provided', async () => {
      const svc = OTPService.getInstance();
      const result = await svc.sendOtp({
        userId: 'user-1',
        delivery: 'sms',
        toPhone: '+15551234567',
      });

      expect(sendOtpSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toPhone: '+15551234567',
        })
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('dispatches email notification when email + address provided', async () => {
      const svc = OTPService.getInstance();
      await svc.sendOtp({
        userId: 'user-1',
        delivery: 'email',
        toEmail: 'user@example.com',
      });

      expect(sendOtpSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: 'user@example.com',
        })
      );
    });
  });

  describe('createOtpRecord', () => {
    it('returns a 6-digit numeric code', async () => {
      const svc = OTPService.getInstance();
      const { code } = await svc.createOtpRecord({
        userId: 'user-1',
        delivery: 'sms',
      });

      expect(code).toMatch(/^\d{6}$/);
    });
  });

  describe('verifyOtp', () => {
    it('returns valid: false when no matching rows', async () => {
      const svc = OTPService.getInstance();
      const result = await svc.verifyOtp({
        userId: 'no-rows-user',
        code: '000000',
      });
      expect(result.valid).toBe(false);
    });
  });
});
