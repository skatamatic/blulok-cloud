import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { DatabaseService } from '@/services/database.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { logger } from '@/utils/logger';

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

    logger.info(`OTP dispatched via ${params.delivery} for user ${params.userId}${params.inviteId ? ` invite ${params.inviteId}` : ''}`);
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
        // On success, increment attempts minimally and invalidate other rows for same context.
        await this.db('user_otps').where('id', row.id).update({ attempts: row.attempts + 1, updated_at: this.db.fn.now() });
        await this.db('user_otps')
          .where('user_id', params.userId)
          .modify((qb) => {
            if (params.inviteId) qb.where('invite_id', params.inviteId);
          })
          .whereNot('id', row.id)
          .update({ attempts: OTP_MAX_ATTEMPTS, updated_at: this.db.fn.now() });
        logger.info(`OTP verified for user ${params.userId}${params.inviteId ? ` invite ${params.inviteId}` : ''}`);
        return { valid: true };
      } else {
        await this.db('user_otps').where('id', row.id).update({ attempts: row.attempts + 1, updated_at: this.db.fn.now() });
        // small delay to slow brute force
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    // final delay if no match
    await new Promise((r) => setTimeout(r, 150));
    logger.warn(`OTP verification failed for user ${params.userId}${params.inviteId ? ` invite ${params.inviteId}` : ''}`);
    return { valid: false };
  }

  /**
   * DEV ONLY: Issue an OTP and return the plaintext code without sending notifications.
   * Restricted to non-production environments and intended for automated tests.
   */
  public async issueOtpForDev(params: {
    userId: string;
    inviteId?: string | null;
    delivery: OtpDeliveryMethod;
  }): Promise<{ code: string; expiresAt: Date }> {
    if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
      throw new Error('issueOtpForDev is disabled in production');
    }
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
    logger.info(`DEV-OTP issued (not sent) for user ${params.userId}${params.inviteId ? ` invite ${params.inviteId}` : ''}`);
    return { code, expiresAt };
  }

  private static generateCode(): string {
    const n = crypto.randomInt(0, 1000000);
    return n.toString().padStart(6, '0');
  }
}


