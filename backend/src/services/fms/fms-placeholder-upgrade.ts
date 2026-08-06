/**
 * Shared FMS placeholder upgrade: uniqueness checks + column updates + invite.
 * Used by admin PUT /users and FMS applyTenantAdded / applyTenantUpdated.
 */

import { UserModel, User } from '@/models/user.model';
import { logger } from '@/utils/logger';
import {
  buildPlaceholderUpgradeUpdates,
  isPlaceholderUser,
  UpgradePlaceholderInput,
} from '@/services/fms/fms-placeholder-user.utils';

export type PlaceholderUpgradeFailureReason =
  | 'no_contact'
  | 'email_in_use'
  | 'phone_in_use'
  | 'login_in_use';

export type PlaceholderUpgradePrepareResult =
  | {
      ok: true;
      updates: NonNullable<ReturnType<typeof buildPlaceholderUpgradeUpdates>>;
    }
  | {
      ok: false;
      reason: PlaceholderUpgradeFailureReason;
      message: string;
    };

/**
 * Validate contact uniqueness and build the user-column updates for a placeholder upgrade.
 * Does not write to the DB — callers apply via UserModel.updateById.
 */
export async function preparePlaceholderUpgrade(
  userId: string,
  input: UpgradePlaceholderInput,
): Promise<PlaceholderUpgradePrepareResult> {
  const upgrade = buildPlaceholderUpgradeUpdates(input);
  if (!upgrade) {
    return {
      ok: false,
      reason: 'no_contact',
      message: 'Add an email or phone number to enable login for this placeholder tenant',
    };
  }

  if (upgrade.email) {
    const byEmail = await UserModel.findByEmail(upgrade.email);
    if (byEmail && byEmail.id !== userId) {
      return {
        ok: false,
        reason: 'email_in_use',
        message: 'Email already in use',
      };
    }
  }

  if (upgrade.phone_number) {
    const byPhone = await UserModel.findByPhone(upgrade.phone_number);
    if (byPhone && byPhone.id !== userId) {
      return {
        ok: false,
        reason: 'phone_in_use',
        message: 'Phone number already in use',
      };
    }
  }

  const byLogin = await UserModel.findByLoginIdentifier(upgrade.login_identifier);
  if (byLogin && byLogin.id !== userId) {
    return {
      ok: false,
      reason: 'login_in_use',
      message: 'Login identity already in use',
    };
  }

  return { ok: true, updates: upgrade };
}

/** FMS apply paths: throw on conflict so the change fails loudly. */
export async function requirePlaceholderUpgradeUpdates(
  userId: string,
  input: UpgradePlaceholderInput,
): Promise<NonNullable<ReturnType<typeof buildPlaceholderUpgradeUpdates>> | null> {
  const result = await preparePlaceholderUpgrade(userId, input);
  if (result.ok) return result.updates;
  if (result.reason === 'no_contact') return null;
  if (result.reason === 'email_in_use') {
    throw new Error('FMS tenant email conflicts with an existing user; cannot upgrade placeholder');
  }
  if (result.reason === 'phone_in_use') {
    throw new Error('FMS tenant phone conflicts with an existing user; cannot upgrade placeholder');
  }
  throw new Error('FMS tenant login identity conflicts with an existing user; cannot upgrade placeholder');
}

/**
 * Fire-and-forget first-time invite after a successful placeholder → loginable upgrade.
 */
export function queueInviteAfterPlaceholderUpgrade(
  user: User,
  logContext?: { syncLogId?: string; facilityId?: string },
): void {
  if (isPlaceholderUser(user)) return;
  void import('@/services/first-time-user.service')
    .then(({ FirstTimeUserService }) => FirstTimeUserService.getInstance().sendInvite(user))
    .catch((e) => {
      logger.warn(`[FMS] Failed to send invite after placeholder upgrade for ${user.id}`, {
        ...logContext,
        error: e,
      });
    });
}
