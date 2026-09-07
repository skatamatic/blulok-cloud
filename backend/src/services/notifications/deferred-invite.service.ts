/**
 * Deferred FMS invite bookkeeping.
 *
 * When invitePolicy suppresses an invite at tenant creation, a row is recorded
 * here. Rows with reason=awaiting_blulok_device are auto-resolved (invite sent)
 * when the tenant becomes eligible. Rows with reason=policy_none stay until an
 * admin manually invites (or policy changes and a future sync re-evaluates).
 */

import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import type { Knex } from 'knex';

export type DeferredInviteReason = 'policy_none' | 'awaiting_blulok_device';

export interface DeferredUserInvite {
  id: string;
  user_id: string;
  facility_id: string;
  reason: DeferredInviteReason;
  created_at: Date;
  resolved_at: Date | null;
  resolved_reason: string | null;
}

export class DeferredInviteService {
  private static instance: DeferredInviteService;

  public static getInstance(): DeferredInviteService {
    if (!DeferredInviteService.instance) {
      DeferredInviteService.instance = new DeferredInviteService();
    }
    return DeferredInviteService.instance;
  }

  private db(): Knex {
    return DatabaseService.getInstance().connection;
  }

  /**
   * Upsert an unresolved deferred invite for a user.
   * Replaces any previous unresolved row for that user.
   * Schema has UNIQUE(user_id), so a previously resolved row is reopened
   * instead of inserting a second row (avoids duplicate-key failures).
   */
  public async recordDeferredInvite(params: {
    userId: string;
    facilityId: string;
    reason: DeferredInviteReason;
  }): Promise<DeferredUserInvite> {
    const knex = this.db();
    const existing = await knex('deferred_user_invites')
      .where({ user_id: params.userId })
      .whereNull('resolved_at')
      .first();

    if (existing) {
      await knex('deferred_user_invites')
        .where({ id: existing.id })
        .update({
          facility_id: params.facilityId,
          reason: params.reason,
        });
      return {
        ...existing,
        facility_id: params.facilityId,
        reason: params.reason,
      } as DeferredUserInvite;
    }

    // Reopen a previously resolved row (UNIQUE user_id prevents a second insert)
    const prior = await knex('deferred_user_invites')
      .where({ user_id: params.userId })
      .first();

    if (prior) {
      await knex('deferred_user_invites')
        .where({ id: prior.id })
        .update({
          facility_id: params.facilityId,
          reason: params.reason,
          resolved_at: null,
          resolved_reason: null,
        });
      const reopened = await knex('deferred_user_invites').where({ id: prior.id }).first();
      logger.info(`[DeferredInvite] Reopened deferred invite for user ${params.userId}`, {
        reason: params.reason,
        facilityId: params.facilityId,
      });
      return reopened as DeferredUserInvite;
    }

    const [id] = await knex('deferred_user_invites').insert({
      user_id: params.userId,
      facility_id: params.facilityId,
      reason: params.reason,
    });

    // MySQL returns insert id differently for UUID defaults — re-fetch
    const row = await knex('deferred_user_invites')
      .where({ user_id: params.userId })
      .whereNull('resolved_at')
      .first();

    if (!row) {
      throw new Error(`Failed to record deferred invite for user ${params.userId} (insert=${id})`);
    }

    logger.info(`[DeferredInvite] Recorded deferred invite for user ${params.userId}`, {
      reason: params.reason,
      facilityId: params.facilityId,
    });

    return row as DeferredUserInvite;
  }

  /**
   * Atomically claim a pending deferred row so concurrent event handlers
   * only send one invite. Returns false if already claimed/resolved.
   * Callers should reopen on send failure via reopenClaim.
   */
  public async tryClaimPending(
    id: string,
    resolvedReason: string,
  ): Promise<boolean> {
    const updated = await this.db()('deferred_user_invites')
      .where({ id })
      .whereNull('resolved_at')
      .update({
        resolved_at: this.db().fn.now(),
        resolved_reason: resolvedReason,
      });
    return updated > 0;
  }

  /** Undo a failed claim so another event can retry delivery. */
  public async reopenClaim(id: string): Promise<void> {
    await this.db()('deferred_user_invites')
      .where({ id })
      .update({
        resolved_at: null,
        resolved_reason: null,
      });
  }

  public async findPendingByUserId(userId: string): Promise<DeferredUserInvite | null> {
    const row = await this.db()('deferred_user_invites')
      .where({ user_id: userId })
      .whereNull('resolved_at')
      .first();
    return (row as DeferredUserInvite) || null;
  }

  /**
   * Pending deferred invites for tenants of a given unit that are awaiting a device.
   */
  public async findPendingAwaitingDeviceForUnit(unitId: string): Promise<DeferredUserInvite[]> {
    const knex = this.db();
    const rows = await knex('deferred_user_invites as d')
      .join('unit_assignments as ua', 'ua.tenant_id', 'd.user_id')
      .where('ua.unit_id', unitId)
      .where('d.reason', 'awaiting_blulok_device')
      .whereNull('d.resolved_at')
      .select('d.*');
    return rows as DeferredUserInvite[];
  }

  /**
   * Pending deferred invite for a tenant if reason is awaiting_blulok_device.
   */
  public async findPendingAwaitingDeviceForTenant(
    tenantId: string,
  ): Promise<DeferredUserInvite | null> {
    const row = await this.db()('deferred_user_invites')
      .where({ user_id: tenantId, reason: 'awaiting_blulok_device' })
      .whereNull('resolved_at')
      .first();
    return (row as DeferredUserInvite) || null;
  }

  public async markResolved(
    id: string,
    resolvedReason: string,
  ): Promise<void> {
    await this.db()('deferred_user_invites')
      .where({ id })
      .update({
        resolved_at: this.db().fn.now(),
        resolved_reason: resolvedReason,
      });
  }

  /**
   * Mark any pending deferred invite for a user as resolved (e.g. after manual invite).
   */
  public async resolvePendingForUser(
    userId: string,
    resolvedReason: string,
  ): Promise<number> {
    return this.db()('deferred_user_invites')
      .where({ user_id: userId })
      .whereNull('resolved_at')
      .update({
        resolved_at: this.db().fn.now(),
        resolved_reason: resolvedReason,
      });
  }
}
