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
   * Generates both the invite token AND the OTP in one step, sending a single
   * notification containing both the deeplink and verification code.
   */
  public async sendInvite(user: User): Promise<void> {
    const { token, inviteId } = await this.invites.createInvite(user.id);
    const deeplinkBase = await this.settings.get('notifications.deeplink_base');
    let base = deeplinkBase || 'blulok://';
    const phone = user.phone_number || '';
    
    // For HTTP/HTTPS URLs, ensure trailing slash; for custom schemes (blulok://), no slash needed
    if (base.match(/^https?:\/\//) && !base.endsWith('/')) {
      base = `${base}/`;
    }
    
    // Build: blulok://invite?token=...&phone=... or https://app.blulok.com/invite?token=...&phone=...
    const deeplink = `${base}invite?token=${encodeURIComponent(token)}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`;

    // Determine delivery method
    const delivery = user.phone_number ? 'sms' : 'email';

    // Create OTP record for this invite (does not send a separate notification)
    const { code } = await this.otps.createOtpRecord({
      userId: user.id,
      inviteId,
      delivery: delivery as 'sms' | 'email',
    });

    // Send single invite notification with both deeplink and OTP code
    await this.notifications.sendInvite({
      toPhone: user.phone_number || undefined,
      toEmail: user.email || undefined,
      deeplink,
      code,
    });
    logger.info(`Invite with OTP sent to user ${user.id} via ${delivery}`);
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

  /**
   * Accept an invite by token. This validates the invite and returns profile info.
   * Does NOT consume the invite - that happens in setPassword.
   * - needs_profile: whether the user needs to provide first/last name
   * - profile: known profile fields (first_name, last_name, email)
   * - missing_fields: list of fields that need to be provided
   */
  public async acceptInvite(params: { token: string }): Promise<{
    needs_profile: boolean;
    profile: { first_name: string | null; last_name: string | null; email: string | null };
    missing_fields: string[];
  }> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    
    const user = await UserModel.findById(invite.user_id) as User | undefined;
    if (!user) throw new Error('User not found for invite');

    // Determine which profile fields are missing
    const hasFirstName = typeof user.first_name === 'string' && user.first_name.trim().length > 0;
    const hasLastName = typeof user.last_name === 'string' && user.last_name.trim().length > 0;
    
    const missing_fields: string[] = [];
    if (!hasFirstName) missing_fields.push('first_name');
    if (!hasLastName) missing_fields.push('last_name');

    logger.info(`Invite accepted for user ${user.id}, needs_profile=${missing_fields.length > 0}`);

    return {
      needs_profile: missing_fields.length > 0,
      profile: {
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        email: user.email || null,
      },
      missing_fields,
    };
  }

  /**
   * Set the user's password, verify OTP, and consume invite.
   * If profile fields are missing and required, they must be provided or the call fails.
   */
  public async setPassword(params: {
    token: string;
    otp: string;
    newPassword: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }): Promise<void> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    
    const valid = await this.verifyOtp({ token: params.token, otp: params.otp });
    if (!valid) throw new Error('Invalid OTP');

    const user = await UserModel.findById(invite.user_id) as User | undefined;
    if (!user) throw new Error('User not found for invite');

    // Check if profile fields are missing and require them
    const hasFirstName = typeof user.first_name === 'string' && user.first_name.trim().length > 0;
    const hasLastName = typeof user.last_name === 'string' && user.last_name.trim().length > 0;

    const updates: Partial<User> & { email?: string } = {
      requires_password_reset: false,
    };

    // If first name is missing, require it
    if (!hasFirstName) {
      const firstName = (params.firstName || '').trim();
      if (!firstName) {
        throw new Error('First name is required to complete your account setup');
      }
      updates.first_name = firstName;
    }

    // If last name is missing, require it
    if (!hasLastName) {
      const lastName = (params.lastName || '').trim();
      if (!lastName) {
        throw new Error('Last name is required to complete your account setup');
      }
      updates.last_name = lastName;
    }

    // Optional: update email if user doesn't have one and caller provides it
    if (!user.email && params.email) {
      const emailLower = params.email.trim().toLowerCase();
      if (emailLower) {
        const existing = await UserModel.findByEmail(emailLower);
        if (existing && existing.id !== user.id) {
          throw new Error('Email is already in use');
        }
        updates.email = emailLower;
      }
    }

    // Set password
    updates.password_hash = await bcrypt.hash(params.newPassword, 12);

    // Activate account if inactive
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


