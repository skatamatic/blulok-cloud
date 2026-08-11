/**
 * Shared FMS invite orchestration: evaluate invitePolicy and either send
 * immediately or record a deferred_user_invites row.
 */

import type { User } from '@/models/user.model';
import type { FMSProviderConfig } from '@/types/fms.types';
import { evaluateFmsInvite } from '@/services/fms/fms-invite-policy.utils';
import { DeferredInviteService } from '@/services/notifications/deferred-invite.service';
import { logger } from '@/utils/logger';

export type QueueFmsInviteContext = {
  facilityId: string;
  syncSettings?: FMSProviderConfig['syncSettings'] | null;
  syncLogId?: string;
};

/**
 * Evaluate facility invite policy for a loginable user and either send an
 * invite or record a deferred invite. Fire-and-forget safe.
 */
export async function queueFmsInviteOrDefer(
  user: User,
  ctx: QueueFmsInviteContext,
): Promise<void> {
  const decision = await evaluateFmsInvite(user, ctx.facilityId, ctx.syncSettings ?? null);
  const deferred = DeferredInviteService.getInstance();

  if (decision === 'skip_placeholder' || decision === 'skip_no_contact') {
    logger.info(`[FMS] Skipping invite for user ${user.id} (${decision})`, {
      facilityId: ctx.facilityId,
      syncLogId: ctx.syncLogId,
    });
    return;
  }

  if (decision === 'send') {
    // Send first; FirstTimeUserService.sendInvite clears any deferred row on success.
    // Do not resolve-before-send — a failed delivery would permanently drop the deferral.
    const { FirstTimeUserService } = await import('@/services/first-time-user.service');
    await FirstTimeUserService.getInstance().sendInvite(user);
    logger.info(`[FMS] Invite sent for user ${user.id} (policy allows)`, {
      facilityId: ctx.facilityId,
      syncLogId: ctx.syncLogId,
    });
    return;
  }

  const reason = decision === 'defer_policy' ? 'policy_none' : 'awaiting_blulok_device';
  await deferred.recordDeferredInvite({
    userId: user.id,
    facilityId: ctx.facilityId,
    reason,
  });
  logger.info(`[FMS] Deferred invite for user ${user.id} (${reason})`, {
    facilityId: ctx.facilityId,
    syncLogId: ctx.syncLogId,
  });
}

/**
 * Fire-and-forget wrapper for FMS apply paths.
 */
export function queueFmsInviteOrDeferAsync(
  user: User,
  ctx: QueueFmsInviteContext,
): void {
  void queueFmsInviteOrDefer(user, ctx).catch((e) => {
    logger.warn(`[FMS] Failed to queue invite for user ${user.id}`, {
      facilityId: ctx.facilityId,
      syncLogId: ctx.syncLogId,
      error: e,
    });
  });
}
