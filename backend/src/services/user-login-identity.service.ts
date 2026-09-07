import { User, UserModel } from '@/models/user.model';
import { DatabaseService } from '@/services/database.service';
import {
  IdentityUserSnapshot,
  LoginIdentityPlan,
  NEW_IDENTITY_SUBJECT_ID,
  formatNoUniqueLoginHandleReview,
  matchUserForFmsTenant,
  normalizeIdentityEmail,
  normalizeIdentityPhone,
  planLoginIdentity,
} from '@/services/user-login-identity.utils';

function toSnapshot(user: Pick<User, 'id' | 'email' | 'phone_number' | 'login_identifier' | 'is_placeholder' | 'is_active' | 'first_name' | 'last_name'>): IdentityUserSnapshot {
  return {
    id: user.id,
    email: user.email,
    phone_number: user.phone_number,
    login_identifier: user.login_identifier,
    is_placeholder: user.is_placeholder,
    is_active: user.is_active,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

export class UserLoginIdentityService {
  /**
   * Load every user that currently owns the given contacts (email, phone, or login_identifier).
   */
  public static async loadCandidates(options: {
    userId?: string | null;
    email?: string | null;
    phone?: string | null;
  }): Promise<IdentityUserSnapshot[]> {
    const email = normalizeIdentityEmail(options.email);
    const phone = normalizeIdentityPhone(options.phone);
    const identifiers = [email, phone].filter((value): value is string => Boolean(value));
    const found = new Map<string, IdentityUserSnapshot>();

    if (options.userId) {
      const self = await UserModel.findById(options.userId) as User | undefined;
      if (self) found.set(self.id, toSnapshot(self));
    }

    if (email) {
      for (const user of await UserModel.findAllByEmail(email)) {
        found.set(user.id, toSnapshot(user));
      }
    }
    if (phone) {
      for (const user of await UserModel.findAllByPhone(phone)) {
        found.set(user.id, toSnapshot(user));
      }
    }
    if (identifiers.length > 0) {
      for (const user of await UserModel.findAllByLoginIdentifiers(identifiers)) {
        found.set(user.id, toSnapshot(user));
      }
    }

    return [...found.values()];
  }

  public static async planContactChange(options: {
    userId?: string | null;
    email?: string | null;
    phone?: string | null;
    allowPlaceholder?: boolean;
    extraUsers?: IdentityUserSnapshot[];
  }): Promise<LoginIdentityPlan> {
    const loaded = await this.loadCandidates({
      userId: options.userId,
      email: options.email,
      phone: options.phone,
    });
    const merged = new Map(loaded.map((user) => [user.id, user]));
    for (const extra of options.extraUsers ?? []) {
      if (!merged.has(extra.id)) merged.set(extra.id, extra);
    }
    return planLoginIdentity({
      users: [...merged.values()],
      subjectId: options.userId || NEW_IDENTITY_SUBJECT_ID,
      email: options.email ?? null,
      phone: options.phone ?? null,
      allowPlaceholder: options.allowPlaceholder,
    });
  }

  public static async applyRebalance(
    rebalance: Array<{ id: string; loginIdentifier: string }>,
  ): Promise<void> {
    if (rebalance.length === 0) return;
    const db = DatabaseService.getInstance().connection;
    await db.transaction(async (trx) => {
      for (const peer of rebalance) {
        await trx('users').where({ id: peer.id }).update({
          login_identifier: peer.loginIdentifier,
          updated_at: trx.fn.now(),
        });
      }
    });
  }

  /**
   * Write subject email/phone/login_identifier and rebalance peers.
   * Callers must pass a successful plan from `planContactChange`.
   */
  public static async applyPlannedContacts(
    userId: string,
    email: string | null,
    phone: string | null,
    plan: Extract<LoginIdentityPlan, { ok: true }>,
    extraUpdates: Record<string, unknown> = {},
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      email,
      phone_number: phone,
      ...extraUpdates,
    };
    if (!plan.isPlaceholder) {
      updates.login_identifier = plan.loginIdentifier;
      updates.is_placeholder = false;
    }
    await UserModel.updateById(userId, updates);
    await this.applyRebalance(plan.rebalance);
  }

  public static async matchFmsTenant(
    fmsTenant: { email?: string | null; phone?: string | null },
    mapping: { internal_id: string } | undefined,
    facilityUsers: IdentityUserSnapshot[],
  ): Promise<ReturnType<typeof matchUserForFmsTenant<IdentityUserSnapshot>>> {
    const email = normalizeIdentityEmail(fmsTenant.email);
    const phone = normalizeIdentityPhone(fmsTenant.phone);
    const extra = await this.loadCandidates({ email, phone });
    const merged = new Map(facilityUsers.map((user) => [user.id, user]));
    for (const user of extra) merged.set(user.id, user);
    if (mapping?.internal_id && !merged.has(mapping.internal_id)) {
      const mapped = await UserModel.findById(mapping.internal_id) as User | undefined;
      if (mapped) merged.set(mapped.id, toSnapshot(mapped));
    }
    return matchUserForFmsTenant(fmsTenant, mapping, [...merged.values()]);
  }

  public static noUniqueHandleMessage(email?: string | null, phone?: string | null): string {
    return formatNoUniqueLoginHandleReview(email, phone);
  }
}
