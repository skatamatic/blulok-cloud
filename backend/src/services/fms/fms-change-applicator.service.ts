/**
 * FMS Change Applicator Service
 *
 * Handles application of FMS changes to BluLok state.
 * Extracted from FMSService to reduce monolith size.
 */

import { User, UserModel } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UserRole } from '@/types/auth.types';
import {
  FMSChange,
  FMSChangeType,
  FMSChangeAction,
  FMSTenant,
  FMSUnit,
  FMSChangeApplicationResult,
  FMSApplyContext,
  FMSSyncStatus,
} from '@/types/fms.types';
import { sortChangesForApply, partitionChangesForAutoApply, resolveFmsAutoApplyOutcome, resolveTenantUnitAction, resolveTenantUnitActionData } from './fms-apply-order.utils';
import { buildFmsApplyErrorDetail, formatFmsApplyErrorFallback } from './fms-apply-error.utils';
import { clearFmsMappingRemoved, stampFmsMappingRemoved, isFmsUserRemovedFromFacility, isUserInactive } from './fms-tenant-removal.utils';
import { isPlaceholderUser } from './fms-placeholder-user.utils';
import { logger } from '@/utils/logger';
import type { FMSServiceModels, FMSServiceCore, FMSSyncProgressPayload } from './fms-service-context';

/**
 * Collaborator service for FMS change application.
 * Models are accessed via getter to support test-time mocking on parent service.
 */
export class FMSChangeApplicatorService {
  constructor(
    private readonly getModels: () => FMSServiceModels,
    private readonly core: FMSServiceCore
  ) {}

  private get models(): FMSServiceModels {
    return this.getModels();
  }

  /**
   * Apply approved FMS changes to the BluLok system.
   */
  async applyChanges(
    syncLogId: string,
    changeIds: string[]
  ): Promise<FMSChangeApplicationResult> {
    const result: FMSChangeApplicationResult = {
      success: true,
      changesApplied: 0,
      changesFailed: 0,
      errors: [],
      errorDetails: [],
      appliedChangeIds: [],
      failedChangeIds: [],
      accessChanges: {
        usersCreated: [],
        usersDeactivated: [],
        accessGranted: [],
        accessRevoked: [],
      },
    };

    const allChanges = await this.models.changeModel.findByIds(changeIds);
    const changes = sortChangesForApply(allChanges);

    const syncLog = await this.models.syncLogModel.findById(syncLogId);
    if (!syncLog) throw new Error(`Sync log ${syncLogId} not found`);

    const [config, unitMappings] = await Promise.all([
      this.models.fmsConfigModel.findByFacilityId(syncLog.facility_id),
      this.models.entityMappingModel.findByFacility(syncLog.facility_id, 'unit'),
    ]);

    const ctx: FMSApplyContext = {
      facilityId: syncLog.facility_id,
      performedBy: syncLog.triggered_by_user_id || 'fms-system',
      config,
      unitMappingsByExternalId: new Map(unitMappings.map((m) => [m.external_id, m])),
    };

    const totalChanges = changes.length;

    logger.info(`[FMS] Applying ${totalChanges} changes in dependency order`, {
      fms_sync: true,
      sync_log_id: syncLogId,
      order: changes.map((c) => c.change_type),
    });

    this.core.broadcastFMSSyncProgress({
      facilityId: ctx.facilityId,
      syncLogId,
      step: 'applying',
      percent: 0,
      message: `Applying 0 of ${totalChanges} changes…`,
    });

    const appliedIds: string[] = [];
    const failureReasons = new Map<string, string[]>();

    for (let index = 0; index < changes.length; index++) {
      const change = changes[index];
      if (!change) continue;

      try {
        await this.applyChange(change, result, ctx);
        appliedIds.push(change.id);
        result.changesApplied++;

        const completed = index + 1;
        this.core.broadcastFMSSyncProgress({
          facilityId: ctx.facilityId,
          syncLogId,
          step: 'applying',
          percent: totalChanges > 0 ? Math.round((completed / totalChanges) * 100) : 100,
          message: `Applying ${completed} of ${totalChanges}: ${change.change_type.replace(/_/g, ' ')}`,
        });
      } catch (error) {
        logger.error(`Failed to apply change ${change.id}:`, error);
        result.changesFailed++;
        result.failedChangeIds.push(change.id);
        const detail = buildFmsApplyErrorDetail(change, error);
        result.errorDetails.push(detail);
        result.errors.push(formatFmsApplyErrorFallback(detail));
        failureReasons.set(change.id, [detail.message]);
      }
    }

    result.appliedChangeIds = appliedIds;
    result.success = result.changesFailed === 0;

    this.core.broadcastFMSSyncProgress({
      facilityId: ctx.facilityId,
      syncLogId,
      step: 'applying',
      percent: 100,
      message: `Finished applying ${result.changesApplied} of ${totalChanges} changes`,
    });

    if (appliedIds.length > 0) {
      await this.models.changeModel.bulkMarkApplied(appliedIds);
    }

    if (result.failedChangeIds.length > 0) {
      await this.models.changeModel.markApplyFailed(result.failedChangeIds, failureReasons);
    }

    await this.refreshSyncLogChangeCounts(syncLogId);
    this.core.broadcastFMSSyncUpdate(ctx.facilityId);

    return result;
  }

  /**
   * Reconcile sync log counters from fms_changes rows after review/apply.
   */
  async refreshSyncLogChangeCounts(syncLogId: string): Promise<string | null> {
    const syncLog = await this.models.syncLogModel.findById(syncLogId);
    if (!syncLog) return null;

    const stats = await this.models.changeModel.getStatsBySyncLogId(syncLogId);
    const allChanges = await this.models.changeModel.findBySyncLogId(syncLogId);
    const appliedCount = allChanges.filter((c) => c.applied_at != null).length;

    const update: any = {
      changes_pending: stats.pending,
      changes_rejected: stats.rejected,
      changes_applied: appliedCount,
    };

    if (stats.pending === 0 && syncLog.sync_status === FMSSyncStatus.PENDING_REVIEW) {
      update.sync_status = FMSSyncStatus.COMPLETED;
    } else if (stats.pending > 0 && syncLog.sync_status === FMSSyncStatus.COMPLETED) {
      update.sync_status = FMSSyncStatus.PENDING_REVIEW;
    }

    await this.models.syncLogModel.update(syncLogId, update);
    return syncLog.facility_id;
  }

  /**
   * Apply a single change.
   */
  async applyChange(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    switch (change.change_type) {
      case FMSChangeType.TENANT_ADDED:
        await this.applyTenantAdded(change, result, ctx);
        break;
      case FMSChangeType.TENANT_REMOVED:
        await this.applyTenantRemoved(change, result, ctx);
        break;
      case FMSChangeType.TENANT_UPDATED:
        await this.applyTenantUpdated(change, result, ctx);
        break;
      case FMSChangeType.TENANT_UNIT_CHANGED:
        await this.applyTenantUnitChanged(change, result, ctx);
        break;
      case FMSChangeType.UNIT_ADDED:
        await this.applyUnitAdded(change, result, ctx);
        break;
      case FMSChangeType.UNIT_UPDATED:
        await this.applyUnitUpdated(change, result, ctx);
        break;
      case FMSChangeType.UNIT_REMOVED:
        await this.applyUnitRemoved(change, result, ctx);
        break;
      case FMSChangeType.UNIT_OVERLOCK_CHANGED:
        await this.applyUnitOverlockChanged(change, result, ctx);
        break;
      default:
        logger.warn(`Unhandled change type: ${change.change_type}`);
    }
  }

  /**
   * Reverse tenant_removed side effects when FMS brings the tenant back.
   */
  async restoreFmsTenantAccess(
    userId: string,
    facilityId: string,
    ctx: {
      mapping?: { id: string; metadata?: Record<string, unknown> | null } | null;
      performedBy: string;
      syncLogId: string;
      force?: boolean;
    }
  ): Promise<boolean> {
    const mapping =
      ctx.mapping ??
      (await this.models.entityMappingModel.findByInternalId(facilityId, 'user', userId));

    const user = (await UserModel.findById(userId)) as User | undefined;
    const userFacilities = await UserFacilityAssociationModel.getUserFacilityIds(userId);
    const hasFacility = userFacilities.includes(facilityId);
    const facilityAssignmentCount = hasFacility ? 1 : 0;

    const needsRestore =
      ctx.force === true || isFmsUserRemovedFromFacility(mapping, user, facilityAssignmentCount);

    if (!needsRestore) {
      return false;
    }

    if (!hasFacility) {
      await UserFacilityAssociationModel.addUserToFacility(userId, facilityId);
      logger.info('[FMS] Restored facility association for tenant returning from FMS', {
        fms_sync: true,
        sync_log_id: ctx.syncLogId,
        facility_id: facilityId,
        user_id: userId,
        performed_by: ctx.performedBy,
      });
    }

    if (user && isUserInactive(user)) {
      await UserModel.activateUser(userId);
      void import('@/services/user-activation-side-effects.service')
        .then(({ runUserActivationSideEffects }) => runUserActivationSideEffects(userId))
        .catch((err) => {
          logger.error('[FMS] Failed to run activation side effects after restore', err);
        });
      logger.info('[FMS] Reactivated tenant present in FMS', {
        fms_sync: true,
        sync_log_id: ctx.syncLogId,
        facility_id: facilityId,
        user_id: userId,
        performed_by: ctx.performedBy,
      });
    }

    return true;
  }

  /**
   * Apply tenant added change.
   */
  private async applyTenantAdded(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    const tenantData = change.after_data as FMSTenant;
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const config = ctx.config ?? (await this.models.fmsConfigModel.findByFacilityId(facilityId));

    const rawEmail = tenantData.email?.trim() || '';
    const rawPhone = tenantData.phone?.trim() || '';
    const { toE164 } = await import('@/utils/phone.util');
    const phoneE164 = rawPhone ? toE164(rawPhone) : '';
    const preferredIdentifier = rawEmail
      ? rawEmail.toLowerCase()
      : phoneE164
        ? phoneE164.toLowerCase()
        : '';
    const isPlaceholderCreate = !preferredIdentifier;

    const {
      buildFmsPlaceholderLoginIdentifier,
      FMS_PLACEHOLDER_PASSWORD_HASH,
      isPlaceholderUser,
    } = await import('@/services/fms/fms-placeholder-user.utils');

    const priorMapping = await this.models.entityMappingModel.findByExternalId(
      facilityId,
      'user',
      tenantData.externalId
    );

    let existingUser: User | undefined;
    if (priorMapping?.internal_id) {
      existingUser = (await UserModel.findById(priorMapping.internal_id)) as User | undefined;
    }

    if (!existingUser && preferredIdentifier) {
      existingUser = await UserModel.findByLoginIdentifier(preferredIdentifier);
    }
    if (!existingUser && (rawEmail || phoneE164)) {
      const byEmail = rawEmail ? await UserModel.findByEmail(rawEmail.toLowerCase()) : undefined;
      const byPhone = phoneE164 ? await UserModel.findByPhone(phoneE164) : undefined;

      if (byEmail && byPhone && byEmail.id !== byPhone.id) {
        logger.error('[FMS] Tenant email/phone conflict with existing users', {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          tenant_email: rawEmail || null,
          tenant_phone: rawPhone || null,
          email_user_id: byEmail.id,
          phone_user_id: byPhone.id,
        });
        throw new Error('FMS tenant email/phone conflict with existing users');
      }

      existingUser = byEmail || byPhone;
    }

    let user: User;
    let upgradedFromPlaceholder = false;
    if (existingUser) {
      logger.info(
        `[FMS] User ${tenantData.email || tenantData.externalId} already exists. Ensuring data, facility association and mapping.`,
        {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          user_id: existingUser.id,
        }
      );

      const updates: Partial<User> = {};
      const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : null;
      const wasPlaceholder = isPlaceholderUser(existingUser);
      const { requirePlaceholderUpgradeUpdates } = await import(
        '@/services/fms/fms-placeholder-upgrade'
      );

      if (wasPlaceholder && preferredIdentifier) {
        const upgrade = await requirePlaceholderUpgradeUpdates(existingUser.id, {
          email: normalizedEmail,
          phoneE164: phoneE164 || null,
        });
        if (upgrade) {
          Object.assign(updates, upgrade);
        }
      } else {
        if (normalizedEmail && existingUser.email !== normalizedEmail) {
          updates.email = normalizedEmail;
        }
        if (phoneE164 && existingUser.phone_number !== phoneE164) {
          updates.phone_number = phoneE164;
        }
        const newLoginIdentifier =
          preferredIdentifier ||
          existingUser.email ||
          existingUser.phone_number ||
          existingUser.login_identifier;
        if (newLoginIdentifier && existingUser.login_identifier !== newLoginIdentifier) {
          updates.login_identifier = newLoginIdentifier.toLowerCase();
        }
      }

      if (tenantData.firstName && existingUser.first_name !== tenantData.firstName) {
        updates.first_name = tenantData.firstName;
      }
      if (tenantData.lastName && existingUser.last_name !== tenantData.lastName) {
        updates.last_name = tenantData.lastName;
      }

      if (Object.keys(updates).length > 0) {
        await UserModel.updateById(existingUser.id, updates as any);
        user = (await UserModel.findById(existingUser.id)) as User;
      } else {
        user = existingUser;
      }

      upgradedFromPlaceholder = wasPlaceholder && !isPlaceholderUser(user);
    } else {
      if (isPlaceholderCreate) {
        user = (await UserModel.create({
          login_identifier: buildFmsPlaceholderLoginIdentifier(facilityId, tenantData.externalId),
          email: null,
          phone_number: null,
          first_name: tenantData.firstName,
          last_name: tenantData.lastName,
          role: UserRole.TENANT,
          password_hash: FMS_PLACEHOLDER_PASSWORD_HASH,
          is_active: true,
          is_placeholder: true,
          requires_password_reset: true,
        })) as any;
        logger.info(
          `[FMS] Created placeholder tenant user for external_id ${tenantData.externalId} (${user.id}) by ${performedBy}`,
          {
            fms_sync: true,
            sync_log_id: change.sync_log_id,
            facility_id: facilityId,
          }
        );
      } else {
        user = (await UserModel.create({
          login_identifier: preferredIdentifier,
          email: rawEmail || null,
          phone_number: phoneE164 || null,
          first_name: tenantData.firstName,
          last_name: tenantData.lastName,
          role: UserRole.TENANT,
          password_hash: FMS_PLACEHOLDER_PASSWORD_HASH,
          is_active: true,
          is_placeholder: false,
          requires_password_reset: true,
        })) as any;

        logger.info(
          `[FMS] Created tenant user: ${user.email || user.phone_number} (${user.id}) by ${performedBy}`,
          {
            fms_sync: true,
            sync_log_id: change.sync_log_id,
            facility_id: facilityId,
          }
        );
      }

      result.accessChanges.usersCreated.push(user.id);
      await UserFacilityAssociationModel.addUserToFacility(user.id, facilityId);
    }

    const existingMapping =
      priorMapping ??
      (await this.models.entityMappingModel.findByExternalId(facilityId, 'user', tenantData.externalId));

    if (!existingMapping) {
      await this.restoreFmsTenantAccess(user.id, facilityId, {
        performedBy,
        syncLogId: change.sync_log_id,
        force: true,
      });
      await this.models.entityMappingModel.create({
        facility_id: facilityId,
        entity_type: 'user',
        external_id: tenantData.externalId,
        internal_id: user.id,
        provider_type: config?.provider_type || 'generic_rest',
        metadata: {
          email: tenantData.email,
          phone: tenantData.phone,
          leaseStartDate: tenantData.leaseStartDate,
          leaseEndDate: tenantData.leaseEndDate,
        },
      });
    } else {
      await this.restoreFmsTenantAccess(user.id, facilityId, {
        mapping: existingMapping,
        performedBy,
        syncLogId: change.sync_log_id,
        force: true,
      });
      if (existingMapping.internal_id !== user.id) {
        await this.models.entityMappingModel.updateInternalId(existingMapping.id, user.id);
        logger.info(`[FMS] Remapped tenant external_id ${tenantData.externalId} to user ${user.id}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          previous_internal_id: existingMapping.internal_id,
          new_internal_id: user.id,
        });
      }
      await this.models.entityMappingModel.updateMetadata(
        existingMapping.id,
        clearFmsMappingRemoved({
          ...existingMapping.metadata,
          email: tenantData.email,
          phone: tenantData.phone,
          leaseStartDate: tenantData.leaseStartDate,
          leaseEndDate: tenantData.leaseEndDate,
        })
      );
      logger.info(
        `[FMS] User entity mapping already exists for external_id ${tenantData.externalId}`,
        {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          internal_id: user.id,
          upgraded_from_placeholder: upgradedFromPlaceholder,
        }
      );
    }

    const unitMappingsByExternalId =
      ctx.unitMappingsByExternalId ??
      new Map(
        (await this.models.entityMappingModel.findByFacility(facilityId, 'unit')).map((m) => [
          m.external_id,
          m,
        ])
      );

    const validUnitIds: string[] = [];
    for (const externalUnitId of tenantData.unitIds) {
      const unitMapping = unitMappingsByExternalId.get(externalUnitId);
      if (unitMapping) {
        validUnitIds.push(unitMapping.internal_id);
      }
    }

    if (validUnitIds.length > 0) {
      const assignResult = await this.models.unitsService.bulkAssignTenant(user.id, validUnitIds, {
        accessType: 'full',
        isPrimary: true,
        performedBy,
        source: 'fms_sync',
        syncLogId: change.sync_log_id,
        notes: `FMS sync: ${tenantData.externalId}`,
      });

      for (const unitId of validUnitIds) {
        result.accessChanges.accessGranted.push({
          userId: user.id,
          unitId,
        });
      }

      if (assignResult.errors.length > 0) {
        logger.warn(`[FMS] Some unit assignments failed for tenant ${user.id}:`, {
          errors: assignResult.errors,
          assigned: assignResult.assigned,
          skipped: assignResult.skipped,
        });
      }
    }

    const wasNewlyCreatedLoginable =
      result.accessChanges.usersCreated.includes(user.id) && !isPlaceholderUser(user);
    if (wasNewlyCreatedLoginable || upgradedFromPlaceholder) {
      const { queueFmsInviteOrDeferAsync } = await import('@/services/fms/fms-invite-queue.utils');
      queueFmsInviteOrDeferAsync(user, {
        facilityId,
        syncSettings: config?.config?.syncSettings,
        syncLogId: change.sync_log_id,
      });
    }

    logger.info(`[FMS] Tenant ${user.email} created with ${tenantData.unitIds.length} unit assignment(s)`, {
      fms_sync: true,
      user_id: user.id,
      sync_log_id: change.sync_log_id,
    });
  }

  /**
   * Apply tenant removed change.
   */
  async applyTenantRemoved(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx?: FMSApplyContext
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal user ID not found');
    }

    let facilityId: string;
    let performedBy: string;
    if (ctx) {
      facilityId = ctx.facilityId;
      performedBy = ctx.performedBy;
    } else {
      const syncLog = await this.models.syncLogModel.findById(change.sync_log_id);
      if (!syncLog) throw new Error('Sync log not found');
      facilityId = syncLog.facility_id;
      performedBy = syncLog.triggered_by_user_id || 'fms-system';
    }

    const user = await UserModel.findById(change.internal_id);
    if (!user) {
      throw new Error('User not found');
    }

    if ((user as any).role !== UserRole.TENANT) {
      logger.error(`[FMS] Security violation: Attempted to remove non-tenant user`, {
        user_id: change.internal_id,
        user_role: (user as any).role,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      throw new Error(
        `Security violation: FMS can only modify TENANT users, found ${(user as any).role}`
      );
    }

    const allAssignments = await this.models.unitAssignmentModel.findByTenantId(change.internal_id);

    const unitIds = allAssignments.map((a) => a.unit_id);
    const units = unitIds.length > 0 ? await this.models.unitModel.findByIds(unitIds) : [];
    const unitsMap = new Map(units.map((u: any) => [u.id, u]));

    const assignments = allAssignments.filter((assignment) => {
      const unit = unitsMap.get(assignment.unit_id);
      return unit && unit.facility_id === facilityId;
    });

    for (const assignment of assignments) {
      await this.models.unitsService.unassignTenant(assignment.unit_id, change.internal_id, {
        performedBy,
        source: 'fms_sync',
        syncLogId: change.sync_log_id,
      });

      result.accessChanges.accessRevoked.push({
        userId: change.internal_id,
        unitId: assignment.unit_id,
      });
    }

    await this.maybeDeactivateTenantAfterLastUnit(change.internal_id, result, {
      syncLogId: change.sync_log_id,
      performedBy,
    });

    await UserFacilityAssociationModel.removeUserFromFacility(change.internal_id, facilityId);

    const userMapping = await this.models.entityMappingModel.findByInternalId(
      facilityId,
      'user',
      change.internal_id
    );
    if (userMapping) {
      await this.models.entityMappingModel.updateMetadata(
        userMapping.id,
        stampFmsMappingRemoved(userMapping.metadata)
      );
    }

    logger.info(
      `[FMS] Revoked tenant ${change.internal_id} access from ${assignments.length} unit(s) in facility ${facilityId}`,
      {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        performed_by: performedBy,
      }
    );
  }

  /**
   * Apply tenant updated change.
   */
  private async applyTenantUpdated(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal user ID not found');
    }

    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const tenantData = change.after_data as FMSTenant;

    const user = await UserModel.findById(change.internal_id);
    if (!user) {
      throw new Error('User not found');
    }

    if ((user as any).role !== UserRole.TENANT) {
      logger.error(`[FMS] Security violation: Attempted to update non-tenant user`, {
        user_id: change.internal_id,
        user_role: (user as any).role,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      throw new Error(
        `Security violation: FMS can only modify TENANT users, found ${(user as any).role}`
      );
    }

    const mapping = await this.models.entityMappingModel.findByInternalId(
      facilityId,
      'user',
      change.internal_id
    );

    await this.restoreFmsTenantAccess(change.internal_id, facilityId, {
      mapping,
      performedBy,
      syncLogId: change.sync_log_id,
      force: true,
    });

    const userFacilities = await UserFacilityAssociationModel.getUserFacilityIds(change.internal_id);
    if (!userFacilities.includes(facilityId)) {
      throw new Error(
        `Security violation: User ${change.internal_id} is not associated with facility ${facilityId}`
      );
    }

    const rawEmail = tenantData.email?.trim() || '';
    const rawPhone = tenantData.phone?.trim() || '';
    const { toE164 } = await import('@/utils/phone.util');
    const phoneE164 = rawPhone ? toE164(rawPhone) : '';
    const preferredIdentifier = rawEmail
      ? rawEmail.toLowerCase()
      : phoneE164
        ? phoneE164.toLowerCase()
        : '';

    const { isPlaceholderUser } = await import('@/services/fms/fms-placeholder-user.utils');
    const { requirePlaceholderUpgradeUpdates, queueInviteAfterPlaceholderUpgrade } = await import(
      '@/services/fms/fms-placeholder-upgrade'
    );

    const profileUpdates: Partial<User> = {
      ...(tenantData.firstName != null ? { first_name: tenantData.firstName } : {}),
      ...(tenantData.lastName != null ? { last_name: tenantData.lastName } : {}),
    };

    const wasPlaceholder = isPlaceholderUser(user as User);
    if (wasPlaceholder && preferredIdentifier) {
      const upgrade = await requirePlaceholderUpgradeUpdates(change.internal_id, {
        email: rawEmail ? rawEmail.toLowerCase() : null,
        phoneE164: phoneE164 || null,
      });
      if (upgrade) {
        Object.assign(profileUpdates, upgrade);
      }
    } else if (preferredIdentifier) {
      if (rawEmail && (user as User).email !== rawEmail.toLowerCase()) {
        profileUpdates.email = rawEmail.toLowerCase();
      }
      if (phoneE164 && (user as User).phone_number !== phoneE164) {
        profileUpdates.phone_number = phoneE164;
      }
      if ((user as User).login_identifier !== preferredIdentifier) {
        profileUpdates.login_identifier = preferredIdentifier;
      }
    }

    await UserModel.updateById(change.internal_id, profileUpdates as any);

    const config = ctx.config ?? (await this.models.fmsConfigModel.findByFacilityId(facilityId));

    const upgradedUser = (await UserModel.findById(change.internal_id)) as User;
    if (wasPlaceholder && upgradedUser && !isPlaceholderUser(upgradedUser)) {
      queueInviteAfterPlaceholderUpgrade(upgradedUser, {
        syncLogId: change.sync_log_id,
        facilityId,
        syncSettings: config?.config?.syncSettings,
      });
    }

    if (mapping) {
      await this.models.entityMappingModel.updateMetadata(mapping.id, {
        ...clearFmsMappingRemoved(mapping.metadata),
        email: tenantData.email,
        phone: tenantData.phone,
      });
    } else {
      await this.models.entityMappingModel.create({
        facility_id: facilityId,
        entity_type: 'user',
        external_id: tenantData.externalId,
        internal_id: change.internal_id,
        provider_type: config?.provider_type || 'generic_rest',
        metadata: {
          email: tenantData.email,
          phone: tenantData.phone,
          leaseStartDate: tenantData.leaseStartDate,
          leaseEndDate: tenantData.leaseEndDate,
        },
      });
      logger.info(`[FMS] Created entity mapping for existing tenant`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        internal_id: change.internal_id,
        external_id: tenantData.externalId,
      });
    }

    logger.info(`[FMS] Updated tenant user: ${change.internal_id} by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      changes: {
        firstName: tenantData.firstName,
        lastName: tenantData.lastName,
        phone: tenantData.phone,
        email: tenantData.email,
        upgradedFromPlaceholder: isPlaceholderUser(user as User) && !isPlaceholderUser(upgradedUser),
      },
    });
  }

  /**
   * Apply tenant unit assignment change (assign or unassign).
   */
  private async applyTenantUnitChanged(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const tenantInternalId = await this.resolveTenantInternalId(facilityId, change);
    type TenantUnitActionData = {
      action?: string;
      unitId?: string;
      externalUnitId?: string;
      unitNumber?: string;
    };
    const action = resolveTenantUnitAction(change.after_data, change.before_data);
    const actionData =
      resolveTenantUnitActionData(
        action,
        change.after_data as TenantUnitActionData | null,
        change.before_data as TenantUnitActionData | null
      ) ?? ({} as TenantUnitActionData);

    if (!action) {
      throw new Error(
        'Tenant unit change is missing an assign_unit / unassign_unit action payload'
      );
    }

    if (action === 'assign_unit') {
      const tenantMapping = await this.models.entityMappingModel.findByInternalId(
        facilityId,
        'user',
        tenantInternalId
      );
      await this.restoreFmsTenantAccess(tenantInternalId, facilityId, {
        mapping: tenantMapping,
        performedBy,
        syncLogId: change.sync_log_id,
        force: true,
      });
      if (tenantMapping) {
        await this.models.entityMappingModel.updateMetadata(
          tenantMapping.id,
          clearFmsMappingRemoved(tenantMapping.metadata)
        );
      }

      const unitId = await this.resolveUnitInternalId(facilityId, {
        unitId: actionData.unitId,
        externalUnitId: actionData.externalUnitId,
      });

      const unit = await this.models.unitModel.findById(unitId);

      if (!unit) {
        logger.error(`[FMS] Unit ${unitId} not found in database`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          change_id: change.id,
          tenant_id: tenantInternalId,
          unit_id: unitId,
        });
        throw new Error(`Unit ${unitId} not found`);
      }

      if (unit.facility_id !== facilityId) {
        logger.error(`[FMS] Unit ${unitId} belongs to different facility`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          expected_facility_id: facilityId,
          actual_facility_id: unit.facility_id,
          change_id: change.id,
          tenant_id: tenantInternalId,
          unit_id: unitId,
          unit_number: unit.unit_number,
        });
        throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
      }

      await this.models.unitsService.assignTenant(unitId, tenantInternalId, {
        accessType: 'full',
        isPrimary: true,
        performedBy,
        source: 'fms_sync',
        syncLogId: change.sync_log_id,
        notes: `FMS sync: tenant-unit change`,
      });

      result.accessChanges.accessGranted.push({
        userId: tenantInternalId,
        unitId,
      });
    } else {
      const unitId = await this.resolveUnitInternalId(facilityId, {
        unitId: actionData.unitId,
        externalUnitId: actionData.externalUnitId,
      });

      const unit = await this.models.unitModel.findById(unitId);
      if (!unit || unit.facility_id !== facilityId) {
        throw new Error(
          `Security violation: Unit ${unitId} does not belong to facility ${facilityId}`
        );
      }

      await this.models.unitsService.unassignTenant(unitId, tenantInternalId, {
        performedBy,
        source: 'fms_sync',
        syncLogId: change.sync_log_id,
      });

      result.accessChanges.accessRevoked.push({
        userId: tenantInternalId,
        unitId,
      });

      await this.maybeDeactivateTenantAfterLastUnit(tenantInternalId, result, {
        syncLogId: change.sync_log_id,
        performedBy,
      });

      const remainingOnUnit = await this.models.unitAssignmentModel.findByUnitId(unitId);
      if (remainingOnUnit.length === 0) {
        let userRole = UserRole.ADMIN;
        if (performedBy && performedBy !== 'fms-system') {
          const triggeringUser = await UserModel.findById(performedBy);
          if (triggeringUser) {
            userRole = (triggeringUser as any).role;
          }
        }
        const { KeySharingService } = await import('@/services/key-sharing.service');
        await KeySharingService.getInstance().revokeAllActiveSharesForUnit(unitId, performedBy, userRole, {
          bestEffortGatewayDenylist: true,
        });
      }
    }
  }

  async resolveTenantInternalId(facilityId: string, change: FMSChange): Promise<string> {
    if (change.internal_id) {
      return change.internal_id;
    }
    const mapping = await this.models.entityMappingModel.findByExternalId(
      facilityId,
      'user',
      change.external_id
    );
    if (!mapping?.internal_id) {
      throw new Error(`Internal tenant ID not found for FMS tenant ${change.external_id}`);
    }
    return mapping.internal_id;
  }

  async resolveUnitInternalId(
    facilityId: string,
    refs: { unitId?: string; externalUnitId?: string }
  ): Promise<string> {
    if (refs.unitId) {
      return refs.unitId;
    }
    if (refs.externalUnitId) {
      const mapping = await this.models.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        refs.externalUnitId
      );
      if (mapping?.internal_id) {
        return mapping.internal_id;
      }
    }
    throw new Error(
      `Internal unit ID not found${refs.externalUnitId ? ` for FMS unit ${refs.externalUnitId}` : ''}`
    );
  }

  /**
   * Apply unit added change.
   */
  private async applyUnitAdded(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    const unitData = change.after_data as FMSUnit;
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;

    let userRole = UserRole.ADMIN;
    if (performedBy && performedBy !== 'fms-system') {
      const triggeringUser = await UserModel.findById(performedBy);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    const config = ctx.config ?? (await this.models.fmsConfigModel.findByFacilityId(facilityId));

    const existingMapping = await this.models.entityMappingModel.findByExternalId(
      facilityId,
      'unit',
      unitData.externalId
    );

    if (existingMapping) {
      logger.info(
        `[FMS] Unit with external ID ${unitData.externalId} already has a mapping, skipping creation`,
        {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          internal_id: existingMapping.internal_id,
        }
      );
      return;
    }

    const allUnits = await this.models.unitModel.getUnitsListForUser('admin', UserRole.ADMIN, {
      facility_id: facilityId,
      limit: 1000,
      offset: 0,
    });
    const existingUnit = (allUnits.units || []).find(
      (u: any) => u.unit_number === unitData.unitNumber
    );

    if (existingUnit) {
      logger.info(`[FMS] Unit ${unitData.unitNumber} already exists, creating mapping only`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        unit_id: existingUnit.id,
      });

      const existingUnitMapping = await this.models.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        unitData.externalId
      );

      logger.info(`[FMS] Creating mapping for existing unit ${unitData.unitNumber}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        existing_unit_id: existingUnit.id,
        existing_unit_number: existingUnit.unit_number,
        existing_mapping: !!existingUnitMapping,
      });

      if (!existingUnitMapping) {
        await this.models.entityMappingModel.create({
          facility_id: facilityId,
          entity_type: 'unit',
          external_id: unitData.externalId,
          internal_id: existingUnit.id,
          provider_type: config?.provider_type || 'generic_rest',
          metadata: {
            unitNumber: unitData.unitNumber,
            unitType: unitData.unitType,
          },
        });

        logger.info(`[FMS] Created mapping for existing unit ${unitData.unitNumber}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          external_id: unitData.externalId,
          internal_id: existingUnit.id,
        });
      } else {
        logger.info(
          `[FMS] Unit entity mapping already exists for external_id ${unitData.externalId}`,
          {
            fms_sync: true,
            sync_log_id: change.sync_log_id,
            facility_id: facilityId,
            existing_internal_id: existingUnitMapping.internal_id,
            expected_internal_id: existingUnit.id,
          }
        );
      }

      logger.info(`[FMS] Created FMS mapping for existing unit ${unitData.unitNumber}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      return;
    }

    const newUnit = await this.models.unitsService.createUnit(
      {
        facility_id: facilityId,
        unit_number: unitData.unitNumber,
        unit_type: unitData.unitType || 'storage',
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_size: unitData.size,
          fms_custom_fields: unitData.customFields,
        },
      },
      performedBy,
      userRole
    );

    try {
      await this.models.entityMappingModel.ensureMapping({
        facility_id: facilityId,
        entity_type: 'unit',
        external_id: unitData.externalId,
        internal_id: newUnit.id,
        provider_type: config?.provider_type || 'generic_rest',
        metadata: {
          unitNumber: unitData.unitNumber,
          syncedAt: new Date(),
        },
      });
      logger.info(`[FMS] Ensured mapping for unit ${unitData.unitNumber}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        internal_id: newUnit.id,
      });
    } catch (e) {
      if ((e as any).code === 'FMS_MAPPING_CONFLICT') {
        logger.error('[FMS] Mapping conflict when creating unit mapping', {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          external_id: unitData.externalId,
          new_internal_id: newUnit.id,
          existing_internal_id: (e as any).existing_internal_id,
        });
        throw e;
      }
      throw e;
    }

    logger.info(`[FMS] Created unit ${unitData.unitNumber} (${newUnit.id}) by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });
  }

  /**
   * Deactivate a tenant when they have no remaining unit assignments and no active shared keys.
   */
  async maybeDeactivateTenantAfterLastUnit(
    tenantId: string,
    result: FMSChangeApplicationResult,
    ctx: { syncLogId: string; performedBy: string }
  ): Promise<boolean> {
    const remainingAssignments = await this.models.unitAssignmentModel.findByTenantId(tenantId);
    if (remainingAssignments.length > 0) {
      logger.info(
        `[FMS] Tenant user ${tenantId} not deactivated (remainingAssignments=${remainingAssignments.length})`,
        {
          fms_sync: true,
          sync_log_id: ctx.syncLogId,
        }
      );
      return false;
    }

    const keySharingModel = new KeySharingModel();
    const sharedKeys = await keySharingModel.getUserSharedUnits(tenantId);
    if (sharedKeys.length > 0) {
      logger.info(
        `[FMS] Tenant user ${tenantId} not deactivated (sharedKeys=${sharedKeys.length})`,
        {
          fms_sync: true,
          sync_log_id: ctx.syncLogId,
        }
      );
      return false;
    }

    await UserModel.deactivateUser(tenantId);
    result.accessChanges.usersDeactivated.push(tenantId);
    logger.info(`[FMS] Deactivated tenant user: ${tenantId}`, {
      fms_sync: true,
      sync_log_id: ctx.syncLogId,
      performed_by: ctx.performedBy,
    });
    return true;
  }

  /**
   * Apply unit updated change.
   */
  private async applyUnitUpdated(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal unit ID not found');
    }

    const unitData = change.after_data as FMSUnit;
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const unitId = change.internal_id;

    const unit = await this.models.unitModel.findById(unitId);
    if (!unit) {
      throw new Error(`Unit ${unitId} not found`);
    }

    if (unit.facility_id !== facilityId) {
      logger.error(`[FMS] Security violation: Attempted to update unit from different facility`, {
        unit_id: unitId,
        unit_facility_id: unit.facility_id,
        sync_facility_id: facilityId,
        sync_log_id: change.sync_log_id,
      });
      throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
    }

    let userRole = UserRole.ADMIN;
    if (performedBy && performedBy !== 'fms-system') {
      const triggeringUser = await UserModel.findById(performedBy);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    const config = await this.models.fmsConfigModel.findByFacilityId(facilityId);

    const mappingByExternalId = await this.models.entityMappingModel.findByExternalId(
      facilityId,
      'unit',
      unitData.externalId
    );

    const mappingByInternalId = await this.models.entityMappingModel.findByInternalId(
      facilityId,
      'unit',
      unitId
    );

    if (mappingByExternalId && mappingByExternalId.internal_id !== unitId) {
      logger.info(`[FMS] Deleting stale mapping for external_id ${unitData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        old_internal_id: mappingByExternalId.internal_id,
        new_internal_id: unitId,
      });

      await this.models.entityMappingModel.delete(mappingByExternalId.id);
    }

    if (!mappingByInternalId || mappingByInternalId.external_id !== unitData.externalId) {
      logger.info(`[FMS] Creating/updating FMS entity mapping for unit ${unitId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        is_update: !!mappingByInternalId,
      });

      const finalCheckMapping = await this.models.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        unitData.externalId
      );

      if (!finalCheckMapping) {
        await this.models.entityMappingModel.create({
          facility_id: facilityId,
          entity_type: 'unit',
          external_id: unitData.externalId,
          internal_id: unitId,
          provider_type: config?.provider_type || 'generic_rest',
          metadata: {
            unitNumber: unitData.unitNumber,
            unitType: unitData.unitType,
          },
        });
      } else {
        logger.info(
          `[FMS] Unit entity mapping already exists during update for external_id ${unitData.externalId}`,
          {
            fms_sync: true,
            sync_log_id: change.sync_log_id,
            facility_id: facilityId,
            existing_internal_id: finalCheckMapping.internal_id,
            expected_internal_id: unitId,
          }
        );
      }

      logger.info(`[FMS] Linked unit ${unitId} to FMS external_id ${unitData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
    }

    const targetStatus = unitData.status;
    const assignments = await this.models.unitAssignmentModel.findByUnitId(unitId);

    if (targetStatus !== 'occupied' && assignments.length > 0) {
      for (const assignment of assignments) {
        await this.models.unitsService.unassignTenant(unitId, assignment.tenant_id, {
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
        });
        result.accessChanges.accessRevoked.push({
          userId: assignment.tenant_id,
          unitId,
        });
        await this.maybeDeactivateTenantAfterLastUnit(assignment.tenant_id, result, {
          syncLogId: change.sync_log_id,
          performedBy,
        });
      }

      const { KeySharingService } = await import('@/services/key-sharing.service');
      await KeySharingService.getInstance().revokeAllActiveSharesForUnit(unitId, performedBy, userRole, {
        bestEffortGatewayDenylist: true,
      });
    }

    if (targetStatus === 'occupied') {
      const currentAssignments = await this.models.unitAssignmentModel.findByUnitId(unitId);
      if (currentAssignments.length === 0) {
        const externalTenantId = unitData.tenantId?.trim();
        if (!externalTenantId) {
          throw new Error(
            'Cannot mark this unit occupied until a tenant is assigned. Create or assign the tenant first.'
          );
        }

        const tenantMapping = await this.models.entityMappingModel.findByExternalId(
          facilityId,
          'user',
          externalTenantId
        );
        if (!tenantMapping?.internal_id) {
          throw new Error(
            'Cannot mark this unit occupied because the tenant is not in BluLok yet. Create the tenant first, then retry this unit update.'
          );
        }

        await this.restoreFmsTenantAccess(tenantMapping.internal_id, facilityId, {
          mapping: tenantMapping,
          performedBy,
          syncLogId: change.sync_log_id,
          force: true,
        });
        if (tenantMapping) {
          await this.models.entityMappingModel.updateMetadata(
            tenantMapping.id,
            clearFmsMappingRemoved(tenantMapping.metadata)
          );
        }

        await this.models.unitsService.assignTenant(unitId, tenantMapping.internal_id, {
          accessType: 'full',
          isPrimary: true,
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
          notes: 'FMS sync: unit_updated occupied self-heal',
        });
        result.accessChanges.accessGranted.push({
          userId: tenantMapping.internal_id,
          unitId,
        });
      }
    }

    logger.info(`[FMS] Updating unit ${unitId} status from DB to FMS value`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      unit_id: unitId,
      before_status: change.before_data?.status || 'unknown',
      new_status: unitData.status,
      unit_number: unitData.unitNumber,
    });

    await this.models.unitsService.updateUnit(
      unitId,
      {
        unit_type: unitData.unitType,
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_size: unitData.size,
          fms_custom_fields: unitData.customFields,
          last_fms_sync: new Date(),
        },
      },
      performedBy,
      userRole
    );

    logger.info(
      `[FMS] Updated unit ${unitId} by ${performedBy}: status=${unitData.status}, type=${unitData.unitType}`,
      {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      }
    );
  }

  /**
   * Apply unit removed change.
   */
  private async applyUnitRemoved(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const externalId = change.external_id;

    const mapping = await this.models.entityMappingModel.findByExternalId(facilityId, 'unit', externalId);
    const internalId = change.internal_id ?? mapping?.internal_id;
    if (!internalId) {
      logger.info('[FMS] Unit removed webhook: no mapped unit — nothing to delete', {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: externalId,
      });
      return;
    }

    const unit = await this.models.unitModel.findById(internalId);
    if (!unit || unit.facility_id !== facilityId) {
      throw new Error(`Unit ${internalId} not found in facility ${facilityId}`);
    }

    const assignments = await this.models.unitAssignmentModel.findByUnitId(internalId);
    if (assignments.length > 0) {
      throw new Error(
        `Cannot remove unit ${unit.unit_number}: tenants are still assigned. Unassign tenants first.`
      );
    }

    const hasDevice = await this.models.unitModel.hasBlulokDevice(internalId);
    if (hasDevice) {
      throw new Error(
        `Cannot remove unit ${unit.unit_number}: a BluLok device is still assigned. Unassign the device first.`
      );
    }

    let userRole = UserRole.ADMIN;
    if (performedBy && performedBy !== 'fms-system') {
      const triggeringUser = await UserModel.findById(performedBy);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    await this.models.unitsService.deleteUnit(internalId, performedBy, userRole);

    if (mapping) {
      await this.models.entityMappingModel.delete(mapping.id);
    }

    logger.info(`[FMS] Removed unit ${unit.unit_number} (${internalId}) from FMS delete event`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      external_id: externalId,
    });
  }

  /**
   * Apply overlock flag change from webhook or manual review.
   */
  private async applyUnitOverlockChanged(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    const facilityId = ctx.facilityId;
    const unitId =
      change.internal_id ??
      (await this.resolveUnitInternalId(facilityId, { externalUnitId: change.external_id }));

    const after = change.after_data as { is_overlocked?: boolean };
    const isOverlocked = Boolean(after?.is_overlocked);

    const unit = await this.models.unitModel.findById(unitId);
    if (!unit || unit.facility_id !== facilityId) {
      throw new Error(`Unit ${unitId} not found in facility ${facilityId}`);
    }

    const assignments = await this.models.unitAssignmentModel.findByUnitId(unitId);
    if (isOverlocked && assignments.length === 0) {
      throw new Error('Cannot overlock a vacant unit');
    }

    await this.models.unitModel.setOverlockStatus(unitId, isOverlocked);

    logger.info(`[FMS] Set overlock=${isOverlocked} on unit ${unitId}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });
  }

  /**
   * Auto-accept valid changes only; leave invalid or failed rows in manual review.
   */
  async autoAcceptAndApplyChanges(
    syncLogId: string,
    changes: FMSChange[],
    reviewChangesFn: (changeIds: string[], accepted: boolean) => Promise<void>
  ): Promise<ReturnType<typeof resolveFmsAutoApplyOutcome>> {
    const { autoAppliable } = partitionChangesForAutoApply(changes);

    let applyResult: FMSChangeApplicationResult = {
      success: true,
      changesApplied: 0,
      changesFailed: 0,
      errors: [],
      errorDetails: [],
      appliedChangeIds: [],
      failedChangeIds: [],
      accessChanges: {
        usersCreated: [],
        usersDeactivated: [],
        accessGranted: [],
        accessRevoked: [],
      },
    };

    if (autoAppliable.length > 0) {
      const autoIds = autoAppliable.map((c) => c.id);
      await reviewChangesFn(autoIds, true);
      applyResult = await this.applyChanges(syncLogId, autoIds);
    }

    await this.refreshSyncLogChangeCounts(syncLogId);
    const stats = await this.models.changeModel.getStatsBySyncLogId(syncLogId);

    return resolveFmsAutoApplyOutcome({
      totalChanges: changes.length,
      applyResult,
      pendingCount: stats.pending,
    });
  }
}
