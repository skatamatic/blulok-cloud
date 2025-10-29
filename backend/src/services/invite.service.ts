import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { DatabaseService } from '@/services/database.service';

const INVITE_TTL_HOURS = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || '24', 10);
const SALT_ROUNDS = 10;

export interface UserInviteRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  last_sent_at: Date;
  consumed_at?: Date | null;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export class InviteService {
  private static instance: InviteService;
  private db = DatabaseService.getInstance().connection;

  public static getInstance(): InviteService {
    if (!InviteService.instance) {
      InviteService.instance = new InviteService();
    }
    return InviteService.instance;
  }

  /**
   * Create a new invite for a user and invalidate prior invites.
   * Returns the plaintext token for delivery to the user (not stored).
   */
  public async createInvite(userId: string, metadata?: Record<string, any>): Promise<{ token: string; inviteId: string; expiresAt: Date; }> {
    await this.invalidateInvites(userId);

    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const [inviteId] = await this.db('user_invites').insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_sent_at: now,
      consumed_at: null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    return { token, inviteId: String(inviteId), expiresAt };
  }

  /**
   * Invalidate all active invites for a user.
   */
  public async invalidateInvites(userId: string): Promise<void> {
    await this.db('user_invites')
      .where('user_id', userId)
      .whereNull('consumed_at')
      .where('expires_at', '>', this.db.fn.now())
      .update({ consumed_at: this.db.fn.now(), updated_at: this.db.fn.now() });
  }

  /**
   * Find an active invite by plaintext token.
   * Note: compares against recent, unexpired invites.
   */
  public async findActiveInviteByToken(token: string): Promise<UserInviteRecord | null> {
    const candidates: UserInviteRecord[] = await this.db('user_invites')
      .where('expires_at', '>', this.db.fn.now())
      .andWhere('consumed_at', null)
      .orderBy('last_sent_at', 'desc')
      .limit(25);

    for (const row of candidates) {
      const match = await bcrypt.compare(token, row.token_hash);
      if (match) {
        return {
          ...row,
          metadata: row.metadata ? safeParseJson(row.metadata) : undefined,
        } as UserInviteRecord;
      }
    }
    return null;
  }

  /**
   * Mark invite as consumed (after password set completes).
   */
  public async consumeInvite(inviteId: string): Promise<void> {
    await this.db('user_invites')
      .where('id', inviteId)
      .update({ consumed_at: this.db.fn.now(), updated_at: this.db.fn.now() });
  }
}

function safeParseJson(value: any): any {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return undefined;
  }
}


