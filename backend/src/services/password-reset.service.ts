import bcrypt from 'bcrypt';
import { DatabaseService } from '@/services/database.service';
import { OTPService } from '@/services/otp.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { UserModel, User } from '@/models/user.model';
import { logger } from '@/utils/logger';
import { toE164 } from '@/utils/phone.util';

const OTP_RESEND_MIN_SECONDS = parseInt(process.env.OTP_RESEND_MIN_SECONDS || '30', 10);
const SALT_ROUNDS = 12;

/**
 * Password Reset Service
 * 
 * Handles the forgot password flow with OTP-based 2FA:
 * 1. User requests password reset via email or phone
 * 2. OTP is sent to the user's configured contact method
 * 3. User submits OTP + new password to complete the reset
 * 
 * This mirrors the invite flow pattern for consistency.
 */
export class PasswordResetService {
  private static instance: PasswordResetService;
  private db = DatabaseService.getInstance().connection;
  private otpService = OTPService.getInstance();
  private notifications = NotificationService.getInstance();

  public static getInstance(): PasswordResetService {
    if (!PasswordResetService.instance) {
      PasswordResetService.instance = new PasswordResetService();
    }
    return PasswordResetService.instance;
  }

  /**
   * Request password reset - sends OTP to user's configured contact method
   * Uses the notification system config to determine which channel to use
   */
  public async requestReset(params: { email?: string; phone?: string }): Promise<{ expiresAt: Date; userId: string; deliveryMethod: 'sms' | 'email' }> {
    const { email, phone } = params;

    if (!email && !phone) {
      throw new Error('Email or phone is required');
    }

    // Find user by email or phone
    let user: User | null = null;
    
    if (email) {
      user = await UserModel.findByEmail(email) as User | null;
    } else if (phone) {
      const normalizedPhone = toE164(phone, 'US');
      user = await this.db('users').where('phone_number', normalizedPhone).first() as User | null;
    }

    if (!user) {
      // Don't reveal if user exists - return generic message
      logger.warn(`Password reset requested for non-existent user: ${email || phone}`);
      throw new Error('If an account exists with this information, you will receive a verification code');
    }

    if (!user.is_active) {
      logger.warn(`Password reset requested for inactive user: ${user.id}`);
      throw new Error('Account is not active');
    }

    // Check resend throttle
    const latestOtp = await this.db('user_otps')
      .where('user_id', user.id)
      .whereNull('invite_id')
      .orderBy('created_at', 'desc')
      .first();

    if (latestOtp) {
      const elapsed = (Date.now() - new Date(latestOtp.last_sent_at).getTime()) / 1000;
      if (elapsed < OTP_RESEND_MIN_SECONDS) {
        throw new Error('Please wait before requesting another code');
      }
    }

    // Check which channels are enabled in notification config
    const notificationConfig = await this.notifications.getConfig();
    const smsEnabled = notificationConfig.enabledChannels?.sms !== false;
    const emailEnabled = notificationConfig.enabledChannels?.email === true;

    // Determine delivery method based on what user has and what's enabled
    // Priority: SMS if user has phone and SMS enabled, else email if enabled
    let deliveryMethod: 'sms' | 'email';
    let toPhone: string | undefined;
    let toEmail: string | undefined;

    if (smsEnabled && user.phone_number) {
      deliveryMethod = 'sms';
      toPhone = user.phone_number;
    } else if (emailEnabled && user.email) {
      deliveryMethod = 'email';
      toEmail = user.email;
    } else if (user.phone_number) {
      // Fallback to phone even if SMS not explicitly enabled (for backwards compat)
      deliveryMethod = 'sms';
      toPhone = user.phone_number;
    } else if (user.email) {
      // Fallback to email
      deliveryMethod = 'email';
      toEmail = user.email;
    } else {
      throw new Error('No valid contact method available for this user');
    }

    // Send OTP via the determined channel
    const result = await this.otpService.sendOtp({
      userId: user.id,
      inviteId: null,
      delivery: deliveryMethod,
      toPhone,
      toEmail,
      kind: 'password_reset',
    });

    logger.info(`Password reset OTP sent via ${deliveryMethod} for user ${user.id}`);
    return { expiresAt: result.expiresAt, userId: user.id, deliveryMethod };
  }

  /**
   * Reset password - verifies OTP and sets new password in one step
   * Mirrors the invite setPassword flow
   */
  public async resetPassword(params: { 
    email?: string; 
    phone?: string; 
    otp: string;
    newPassword: string;
  }): Promise<{ success: boolean }> {
    const { email, phone, otp, newPassword } = params;

    // Find user
    let user: User | null = null;
    
    if (email) {
      user = await UserModel.findByEmail(email) as User | null;
    } else if (phone) {
      const normalizedPhone = toE164(phone, 'US');
      user = await this.db('users').where('phone_number', normalizedPhone).first() as User | null;
    }

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.is_active) {
      throw new Error('Account is not active');
    }

    // Verify OTP (no invite context for password reset)
    const result = await this.otpService.verifyOtp({
      userId: user.id,
      inviteId: null,
      code: otp,
    });

    if (!result.valid) {
      throw new Error('Invalid or expired verification code');
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.db('users')
      .where('id', user.id)
      .update({ 
        password_hash: passwordHash, 
        requires_password_reset: false,
        updated_at: this.db.fn.now() 
      });

    logger.info(`Password reset successful for user ${user.id}`);
    return { success: true };
  }
}
