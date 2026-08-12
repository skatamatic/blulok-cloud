import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { DatabaseService } from '@/services/database.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { UserModel, User } from '@/models/user.model';
import { logger } from '@/utils/logger';
import { toE164 } from '@/utils/phone.util';

const TOKEN_EXPIRY_MINUTES = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || '30', 10);
const SALT_ROUNDS = 12;

/**
 * Password Reset Service
 * 
 * Handles the forgot password flow with deeplink + token (similar to invite flow):
 * 1. User requests password reset via email or phone
 * 2. A secure token is generated and stored in the database
 * 3. A deeplink containing the token is sent via email/SMS
 * 4. User clicks the link to open the app with the token
 * 5. User submits the token + new password to complete the reset
 */
export class PasswordResetService {
  private static instance: PasswordResetService;
  private db = DatabaseService.getInstance().connection;
  private notifications = NotificationService.getInstance();

  public static getInstance(): PasswordResetService {
    if (!PasswordResetService.instance) {
      PasswordResetService.instance = new PasswordResetService();
    }
    return PasswordResetService.instance;
  }

  /**
   * Generate a secure random token
   * Uses 24 bytes (192 bits) = ~32 characters in base64url encoding
   * This provides strong security while keeping SMS messages concise
   */
  private generateToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  /**
   * Request password reset - generates token and sends deeplink via email/SMS
   */
  public async requestReset(params: { email?: string; phone?: string }): Promise<{ 
    success: boolean; 
    expiresAt: Date; 
    deliveryMethod: 'sms' | 'email';
  }> {
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
      throw new Error('If an account exists with this information, you will receive a reset link');
    }

    if (!user.is_active) {
      logger.warn(`Password reset requested for inactive user: ${user.id}`);
      throw new Error('Account is not active');
    }

    const { isPlaceholderUser } = await import('@/services/fms/fms-placeholder-user.utils');
    if (isPlaceholderUser(user)) {
      // Same generic response as missing user — do not confirm placeholder accounts
      logger.warn(`Password reset requested for FMS placeholder user: ${user.id}`);
      throw new Error('If an account exists with this information, you will receive a reset link');
    }

    // Invalidate any existing unused tokens for this user
    await this.db('password_reset_tokens')
      .where('user_id', user.id)
      .whereNull('used_at')
      .update({ used_at: this.db.raw('UTC_TIMESTAMP()') });

    // Generate new token
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Store token in database
    await this.db('password_reset_tokens').insert({
      user_id: user.id,
      token,
      expires_at: this.db.raw('DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)', [TOKEN_EXPIRY_MINUTES]),
    });

    if (!user.phone_number && !user.email) {
      throw new Error('No valid contact method available for this user');
    }

    // Hand both contacts to the notification service: it owns channel selection
    // (enabled channels + preference) and throws rather than delivering nothing.
    const outcome = await this.notifications.sendPasswordReset({
      token,
      toPhone: user.phone_number || undefined,
      toEmail: user.email || undefined,
    });

    const deliveryMethod: 'sms' | 'email' = outcome.delivered.includes('SMS') ? 'sms' : 'email';
    logger.info(
      `Password reset token sent via ${outcome.delivered.join(', ')} for user ${user.id}`,
    );
    return { success: true, expiresAt, deliveryMethod };
  }

  /**
   * Verify a password reset token
   */
  public async verifyToken(token: string): Promise<{ 
    valid: boolean; 
    userId?: string;
    email?: string;
  }> {
    const resetToken = await this.db('password_reset_tokens')
      .where('token', token)
      .whereNull('used_at')
      .where('expires_at', '>', this.db.fn.now())
      .first();

    if (!resetToken) {
      return { valid: false };
    }

    // Get user info
    const user = await UserModel.findById(resetToken.user_id) as User | null;
    if (!user || !user.is_active) {
      return { valid: false };
    }

    return { 
      valid: true, 
      userId: user.id,
      email: user.email || undefined,
    };
  }

  /**
   * Reset password using token
   */
  public async resetPassword(params: { 
    token: string;
    newPassword: string;
  }): Promise<{ success: boolean }> {
    const { token, newPassword } = params;

    // Find and validate token
    const resetToken = await this.db('password_reset_tokens')
      .where('token', token)
      .whereNull('used_at')
      .where('expires_at', '>', this.db.fn.now())
      .first();

    if (!resetToken) {
      throw new Error('Invalid or expired reset link');
    }

    // Get user
    const user = await UserModel.findById(resetToken.user_id) as User | null;
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.is_active) {
      throw new Error('Account is not active');
    }

    const { isPlaceholderUser } = await import('@/services/fms/fms-placeholder-user.utils');
    if (isPlaceholderUser(user)) {
      throw new Error('Invalid or expired reset link');
    }

    // Mark token as used
    await this.db('password_reset_tokens')
      .where('id', resetToken.id)
      .update({ used_at: this.db.raw('UTC_TIMESTAMP()') });

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.db('users')
      .where('id', user.id)
      .update({ 
        password_hash: passwordHash, 
        requires_password_reset: false,
        updated_at: this.db.raw('UTC_TIMESTAMP()') 
      });

    logger.info(`Password reset successful for user ${user.id}`);
    return { success: true };
  }
}
