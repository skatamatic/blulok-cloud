/**
 * Shared FMS placeholder upgrade: identity-handle checks + column updates + invite.
 * Used by admin PUT /users and FMS applyTenantAdded / applyTenantUpdated.
 */

import { User } from '@/models/user.model';
import { logger } from '@/utils/logger';
import {
  buildPlaceholderUpgradeUpdates,
  isPlaceholderUser,
  UpgradePlaceholderInput,
} from '@/services/fms/fms-placeholder-user.utils';
import { UserLoginIdentityService } from '@/services/user-login-identity.service';
import { LOGIN_IDENTITY_CODES } from '@/services/user-login-identity.utils';
import type { FMSProviderConfig } from '@/types/fms.types';

export type PlaceholderUpgradeFailureReason =
  | 'no_contact'
  | 'email_in_use'
  | 'phone_in_use'
  | 'login_in_use'
  | typeof LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE
  | typeof LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT;

export type PlaceholderUpgradePrepareResult =
  | {
      ok: true;
      updates: NonNullable<ReturnType<typeof buildPlaceholderUpgradeUpdates>>;
      rebalance: Array<{ id: string; loginIdentifier: string }>;
    }
  | {
      ok: false;
      reason: PlaceholderUpgradeFailureReason;
      message: string;
    };

/**
 * Validate login-handle exclusivity and build the user-column updates for a placeholder upgrade.
 * Does not write to the DB — callers apply via UserModel.updateById + applyRebalance.
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

  const plan = await UserLoginIdentityService.planContactChange({
    userId,
    email: upgrade.email ?? null,
    phone: upgrade.phone_number ?? null,
  });
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.code,
      message: plan.message,
    };
  }

  return {
    ok: true,
    updates: {
      ...upgrade,
      login_identifier: plan.loginIdentifier,
    },
    rebalance: plan.rebalance,
  };
}

/** FMS apply paths: throw on conflict so the change fails loudly. */
export async function requirePlaceholderUpgradeUpdates(
  userId: string,
  input: UpgradePlaceholderInput,
): Promise<{
  updates: NonNullable<ReturnType<typeof buildPlaceholderUpgradeUpdates>>;
  rebalance: Array<{ id: string; loginIdentifier: string }>;
} | null> {
  const result = await preparePlaceholderUpgrade(userId, input);
  if (result.ok) return { updates: result.updates, rebalance: result.rebalance };
  if (result.reason === 'no_contact') return null;
  throw new Error(result.message);
}

/**
 * Fire-and-forget first-time invite after a successful placeholder → loginable upgrade.
 * When facilityId + syncSettings are provided (FMS path), respects invitePolicy.
 * When facilityId is omitted (admin Enable-login path), sends invite immediately.
 */
export function queueInviteAfterPlaceholderUpgrade(
  user: User,
  logContext?: { syncLogId?: string; facilityId?: string; syncSettings?: FMSProviderConfig['syncSettings'] | null },
): void {
  if (isPlaceholderUser(user)) return;

  // Admin Enable-login: always invite (explicit admin action bypasses FMS policy)
  if (!logContext?.facilityId) {
    void import('@/services/first-time-user.service')
      .then(({ FirstTimeUserService }) => FirstTimeUserService.getInstance().sendInvite(user))
      .catch((e) => {
        logger.warn(`[FMS] Failed to send invite after placeholder upgrade for ${user.id}`, {
          ...logContext,
          error: e,
        });
      });
    return;
  }

  void import('@/services/fms/fms-invite-queue.utils')
    .then(({ queueFmsInviteOrDefer }) =>
      queueFmsInviteOrDefer(user, {
        facilityId: logContext.facilityId!,
        syncSettings: logContext.syncSettings,
        syncLogId: logContext.syncLogId,
      }),
    )
    .catch((e) => {
      logger.warn(`[FMS] Failed to queue invite after placeholder upgrade for ${user.id}`, {
        ...logContext,
        error: e,
      });
    });
}
