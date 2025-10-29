import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { DatabaseService } from '@/services/database.service';
import { NotificationService } from '@/services/notifications/notification.service';

const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const SALT_ROUNDS = 10;

export type OtpDeliveryMethod = 'sms' | 'email';

export class OTPService {
  private static instance: OTPService;
  private db = DatabaseService.getInstance().connection;
  private notifications = NotificationService.getInstance();

  public static getInstance(): OTPService {
    if (!OTPService.instance) {
      OTPService.instance = new OTPService();
    }
    return OTPService.instance;
  }

  /** Generate and send OTP, persisting a hashed copy */
  public async sendOtp(params: {
    userId: string;
    inviteId?: string | null;
    delivery: OtpDeliveryMethod;
    toPhone?: string;
    toEmail?: string;
    templateId?: string;
  }): Promise<{ expiresAt: Date }> {
    const code = OTPService.generateCode();
    const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await this.db('user_otps').insert({
      user_id: params.userId,
      invite_id: params.inviteId || null,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      delivery_method: params.delivery,
      last_sent_at: now,
    });

    if (params.delivery === 'sms' && params.toPhone) {
      await this.notifications.sendOtp({ toPhone: params.toPhone, code, templateId: params.templateId });
    } else if (params.delivery === 'email' && params.toEmail) {
      await this.notifications.sendOtp({ toEmail: params.toEmail, code, templateId: params.templateId });
    } else {
      throw new Error('Invalid OTP delivery parameters');
    }

    return { expiresAt };
  }

  /** Verify an OTP code for a user/invite, enforcing TTL and attempt limits */
  public async verifyOtp(params: { userId: string; inviteId?: string | null; code: string; }): Promise<{ valid: boolean; }> {
    const rows = await this.db('user_otps')
      .where('user_id', params.userId)
      .modify((qb) => {
        if (params.inviteId) qb.where('invite_id', params.inviteId);
      })
      .where('expires_at', '>', this.db.fn.now())
      .orderBy('created_at', 'desc')
      .limit(10);

    for (const row of rows) {
      if (row.attempts >= OTP_MAX_ATTEMPTS) continue;
      const match = await bcrypt.compare(params.code, row.code_hash);
      if (match) {
        // On success, optionally we could mark others invalid. Increment attempts minimally.
        await this.db('user_otps').where('id', row.id).update({ attempts: row.attempts + 1, updated_at: this.db.fn.now() });
        return { valid: true };
      } else {
        await this.db('user_otps').where('id', row.id).update({ attempts: row.attempts + 1, updated_at: this.db.fn.now() });
      }
    }
    return { valid: false };
  }

  private static generateCode(): string {
    const n = crypto.randomInt(0, 1000000);
    return n.toString().padStart(6, '0');
  }
}


