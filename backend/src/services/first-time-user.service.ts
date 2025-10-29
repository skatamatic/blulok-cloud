import { InviteService } from '@/services/invite.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { SystemSettingsModel } from '@/models/system-settings.model';
import { User, UserModel } from '@/models/user.model';
import { OTPService } from '@/services/otp.service';
import bcrypt from 'bcrypt';

export class FirstTimeUserService {
  private static instance: FirstTimeUserService;
  private invites = InviteService.getInstance();
  private notifications = NotificationService.getInstance();
  private settings = new SystemSettingsModel();
  private otps = OTPService.getInstance();

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
  }

  /** Request an OTP after validating invite token and user contact ownership */
  public async requestOtp(params: { token: string; phone?: string; email?: string; }): Promise<{ expiresAt: Date; userId: string; inviteId: string; }> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    const user = await UserModel.findById(invite.user_id) as User | undefined;
    if (!user) throw new Error('User not found for invite');

    // Validate contact matches stored user contact; prefer phone if user has phone
    const hasPhone = !!user.phone_number;
    if (hasPhone) {
      if (!params.phone) throw new Error('Phone is required');
      if (!this.phoneMatches(user.phone_number!, params.phone)) throw new Error('Phone does not match');
      const res = await this.otps.sendOtp({ userId: user.id, inviteId: invite.id, delivery: 'sms', toPhone: user.phone_number! });
      return { expiresAt: res.expiresAt, userId: user.id, inviteId: invite.id };
    } else {
      if (!user.email) throw new Error('No delivery method available');
      if (!params.email) throw new Error('Email is required');
      if (user.email.toLowerCase() !== params.email.toLowerCase()) throw new Error('Email does not match');
      const res = await this.otps.sendOtp({ userId: user.id, inviteId: invite.id, delivery: 'email', toEmail: user.email });
      return { expiresAt: res.expiresAt, userId: user.id, inviteId: invite.id };
    }
  }

  /** Verify OTP for the invite */
  public async verifyOtp(params: { token: string; otp: string; }): Promise<boolean> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    const result = await this.otps.verifyOtp({ userId: invite.user_id, inviteId: invite.id, code: params.otp });
    return result.valid;
  }

  /** Set the user's password and consume invite (after otp verified) */
  public async setPassword(params: { token: string; otp: string; newPassword: string; }): Promise<void> {
    const invite = await this.invites.findActiveInviteByToken(params.token);
    if (!invite) throw new Error('Invalid or expired invite token');
    const valid = await this.verifyOtp({ token: params.token, otp: params.otp });
    if (!valid) throw new Error('Invalid OTP');

    const passwordHash = await bcrypt.hash(params.newPassword, 12);
    await UserModel.updateById(invite.user_id, { password_hash: passwordHash, requires_password_reset: false });
    await this.invites.consumeInvite(invite.id);
  }

  private phoneMatches(a: string, b: string): boolean {
    const digits = (s: string) => (s || '').replace(/\D/g, '');
    return digits(a) === digits(b);
  }
}


