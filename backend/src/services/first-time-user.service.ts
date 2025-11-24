import { InviteService } from '@/services/invite.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { SystemSettingsModel } from '@/models/system-settings.model';
import { User, UserModel } from '@/models/user.model';
import { OTPService } from '@/services/otp.service';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';
import bcrypt from 'bcrypt';

export class FirstTimeUserService {
  private static instance: FirstTimeUserService;
  private invites = InviteService.getInstance();
  private notifications = NotificationService.getInstance();
  private settings = new SystemSettingsModel();
  private otps = OTPService.getInstance();
  private db = DatabaseService.getInstance().connection;

  public static getInstance(): FirstTimeUserService {
    if (!FirstTimeUserService.instance) {
      FirstTimeUserService.instance = new FirstTimeUserService();
    }
    return FirstTimeUserService.instance;
  }

  /**
   * Create and send an invitation to a newly created user.
   */
  public async sendInvite(user: User): Promise<void> {
    const { token } = await this.invites.createInvite(user.id);
    const deeplinkBase = await this.settings.get('notifications.deeplink_base');
    const base = deeplinkBase || 'blulok://invite';
    const phone = user.phone_number || '';
    const sep = base.includes('?') ? '&' : '?';
    const deeplink = `${base}${sep}token=${encodeURIComponent(token)}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`;

    await this.notifications.sendInvite({
      toPhone: user.phone_number || undefined,
      toEmail: user.email || undefined,
      deeplink,
    });
    logger.info(`Invite sent to user ${user.id} via ${user.phone_number ? 'sms' : 'email'}`);
  }

  /**
   * Request an OTP after validating invite token and user contact ownership.
   *
   * For users that were created via a phone-only invite (no first/last name populated yet),
   * we require the caller to supply firstName and lastName (and optionally email) so the
   * account can be fully initialized before OTP delivery. This prevents half-configured
   * accounts from being activated without a proper profile.
   *
   * For existing users that already have a profile (non-empty first_name/last_name), the
   * additional fields remain optional and are ignored by this method.
   */
  public async requestOtp(params: { token: string; phone?: string; email?: string; firstName?: string; lastName?: string; }): Promise<{ expiresAt: Date; userId: string; inviteId: string; }> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    const user = await UserModel.findById(invite.user_id) as User | undefined;
    if (!user) throw new Error('User not found for invite');

    // Ensure profile is populated for newly created (phone-only) users
    const hasFirstName = typeof user.first_name === 'string' && user.first_name.trim().length > 0;
    const hasLastName = typeof user.last_name === 'string' && user.last_name.trim().length > 0;
    if (!hasFirstName || !hasLastName) {
      const firstName = (params.firstName || '').trim();
      const lastName = (params.lastName || '').trim();
      if (!firstName || !lastName) {
        throw new Error('First name and last name are required to complete your account setup');
      }

      const updates: Partial<User> = {
        first_name: firstName,
        last_name: lastName,
      };

      // Optional email, only if user does not yet have one
      if (!user.email && params.email) {
        const emailLower = params.email.trim().toLowerCase();
        if (emailLower) {
          const existing = await UserModel.findByEmail(emailLower);
          if (existing && existing.id !== user.id) {
            throw new Error('Email is already in use');
          }
          (updates as any).email = emailLower;
        }
      }

      if (Object.keys(updates).length > 0) {
        await UserModel.updateById(user.id, updates as any);
      }
    }

    // Enforce resend throttle based on the last OTP sent for this invite
    const minSeconds = parseInt(process.env.OTP_RESEND_MIN_SECONDS || '30', 10);
    const latestOtp = await this.db('user_otps')
      .where({ user_id: user.id, invite_id: invite.id })
      .orderBy('last_sent_at', 'desc')
      .first();
    if (latestOtp) {
      const now = Date.now();
      const last = new Date(latestOtp.last_sent_at).getTime();
      if (now - last < minSeconds * 1000) {
        throw new Error('Please wait before requesting another OTP');
      }
    }

    // Validate contact matches stored user contact; prefer phone if user has phone
    const hasPhone = !!user.phone_number;
    if (hasPhone) {
      if (!params.phone) throw new Error('Phone is required');
      if (!this.phoneMatches(user.phone_number!, params.phone)) throw new Error('Phone does not match');
      const res = await this.otps.sendOtp({ userId: user.id, inviteId: invite.id, delivery: 'sms', toPhone: user.phone_number! });
      logger.info(`OTP sent via sms for invite ${invite.id} user ${user.id}`);
      return { expiresAt: res.expiresAt, userId: user.id, inviteId: invite.id };
    } else {
      if (!user.email) throw new Error('No delivery method available');
      if (!params.email) throw new Error('Email is required');
      if (user.email.toLowerCase() !== params.email.toLowerCase()) throw new Error('Email does not match');
      const res = await this.otps.sendOtp({ userId: user.id, inviteId: invite.id, delivery: 'email', toEmail: user.email });
      logger.info(`OTP sent via email for invite ${invite.id} user ${user.id}`);
      return { expiresAt: res.expiresAt, userId: user.id, inviteId: invite.id };
    }
  }

  /** Verify OTP for the invite */
  public async verifyOtp(params: { token: string; otp: string; }): Promise<boolean> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    const result = await this.otps.verifyOtp({ userId: invite.user_id, inviteId: invite.id, code: params.otp });
    if (result.valid) {
      logger.info(`OTP verified for invite ${invite.id} user ${invite.user_id}`);
    } else {
      logger.warn(`OTP verification failed for invite ${invite.id} user ${invite.user_id}`);
    }
    return result.valid;
  }

  /** Set the user's password and consume invite (after otp verified) */
  public async setPassword(params: { token: string; otp: string; newPassword: string; }): Promise<void> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    const valid = await this.verifyOtp({ token: params.token, otp: params.otp });
    if (!valid) throw new Error('Invalid OTP');

    const passwordHash = await bcrypt.hash(params.newPassword, 12);
    // Load user to decide whether to activate on successful first-time setup
    const user = await UserModel.findById(invite.user_id) as User | undefined;
    if (!user) {
      throw new Error('User not found for invite');
    }

    const updates: Partial<User> = {
      password_hash: passwordHash,
      requires_password_reset: false,
    };

    // If the account is currently inactive, treat successful invite completion
    // (valid OTP + password set) as the point where the account becomes active.
    if (!user.is_active) {
      updates.is_active = true;
    }

    await UserModel.updateById(user.id, updates as any);
    await this.invites.consumeInvite(invite.id);
    logger.info(`User ${invite.user_id} set password via invite ${invite.id}`);
  }

  private phoneMatches(a: string, b: string): boolean {
    const digits = (s: string) => (s || '').replace(/\D/g, '');
    return digits(a) === digits(b);
  }
}


