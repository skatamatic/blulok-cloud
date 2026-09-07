/**
 * Derive invite/onboarding status for user list and management widgets.
 */

import { DatabaseService } from '@/services/database.service';

export type UserInviteStatus = 'never_invited' | 'invite_pending' | 'active' | 'placeholder';

export interface UserInviteStatusInfo {
  inviteStatus: UserInviteStatus;
  invitedAt: Date | string | null;
}

/**
 * Batch-load invite status for a page of users.
 * - placeholder: is_placeholder
 * - active: has last_login
 * - invite_pending: has a non-consumed invite (or any last_sent_at)
 * - never_invited: no invites and no last_login
 */
export async function loadInviteStatusForUsers(
  users: Array<{
    id: string;
    last_login?: Date | string | null;
    is_placeholder?: boolean | number | null;
  }>,
): Promise<Map<string, UserInviteStatusInfo>> {
  const result = new Map<string, UserInviteStatusInfo>();
  if (users.length === 0) return result;

  const ids = users.map((u) => u.id);
  const knex = DatabaseService.getInstance().connection;

  const inviteRows: Array<{ user_id: string; last_sent_at: Date; consumed_at: Date | null }> =
    await knex('user_invites')
      .whereIn('user_id', ids)
      .select('user_id', 'last_sent_at', 'consumed_at')
      .orderBy('last_sent_at', 'desc');

  const latestByUser = new Map<string, { last_sent_at: Date; consumed_at: Date | null }>();
  for (const row of inviteRows) {
    if (!latestByUser.has(row.user_id)) {
      latestByUser.set(row.user_id, row);
    }
  }

  for (const user of users) {
    if (user.is_placeholder === true || user.is_placeholder === 1) {
      result.set(user.id, { inviteStatus: 'placeholder', invitedAt: null });
      continue;
    }
    if (user.last_login) {
      const latest = latestByUser.get(user.id);
      result.set(user.id, {
        inviteStatus: 'active',
        invitedAt: latest?.last_sent_at ?? null,
      });
      continue;
    }
    const latest = latestByUser.get(user.id);
    if (latest) {
      result.set(user.id, {
        inviteStatus: 'invite_pending',
        invitedAt: latest.last_sent_at,
      });
    } else {
      result.set(user.id, { inviteStatus: 'never_invited', invitedAt: null });
    }
  }

  return result;
}
