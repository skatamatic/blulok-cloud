/**
 * FMS Change Detector Service
 *
 * Handles detection of changes between external FMS data and BluLok state.
 * Extracted from FMSService to reduce monolith size.
 */

import { UserModel } from '@/models/user.model';
import { UserRole } from '@/types/auth.types';
import {
  FMSChange,
  FMSChangeType,
  FMSChangeAction,
  FMSTenant,
  FMSUnit,
} from '@/types/fms.types';
import {
  buildFmsOccupancyContext,
  buildIdentityCollisionReview,
  buildOccupiedLedgerUnassignReview,
  buildVacantLedgerAssignReview,
  formatVacantUnitLedgerConflictNote,
  isFmsUnitVacantStatus,
  partitionTenantUnitIdsByOccupancy,
  resolveLedgerAssignAgainstUnitStatus,
  resolveLedgerUnassignAgainstUnitStatus,
  resolveOccupiedUnitBlockers,
  shouldOmitOccupiedUnitReview,
  type FmsOccupancyContext,
} from './fms-unit-occupancy-validation.utils';
import {
  clearFmsMappingRemoved,
  isFmsMappingMarkedRemoved,
  isFmsUserRemovedFromFacility,
  isUserInactive,
  stampFmsMappingRemoved,
} from './fms-tenant-removal.utils';
import {
  buildFacilityUserLookupMaps,
  findExistingUserForFmsTenant,
  formatFmsTenantContactLabel,
  hasFmsTenantLoginIdentity,
  validateFmsTenantSyncFields,
} from './fms-tenant-validation.utils';
import { isPlaceholderUser } from './fms-placeholder-user.utils';
import { toE164 } from '@/utils/phone.util';
import { logger } from '@/utils/logger';
import type { FMSServiceModels } from './fms-service-context';

/**
 * Collaborator service for FMS change detection.
 * Stateless — all state is passed via method parameters or injected models.
 * Models are accessed via getter to support test-time mocking on parent service.
 */
export class FMSChangeDetectorService {
  constructor(private readonly getModels: () => FMSServiceModels) {}

  private get models(): FMSServiceModels {
    return this.getModels();
  }

  /**
   * Detect changes between FMS and our system.
   */
  async detectChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string,
    userId?: string,
    userRole?: UserRole,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];

    const effectiveUserId = userId || 'system';
    const effectiveUserRole = userRole || UserRole.ADMIN;
    const allUnitsResult = await this.models.unitModel.getUnitsListForUser(
      effectiveUserId,
      effectiveUserRole,
      { facility_id: facilityId, limit: 10000, offset: 0 }
    );
    const sharedUnits = allUnitsResult.units || [];

    const tenantChanges = await this.detectTenantChanges(
      facilityId,
      fmsTenants,
      fmsUnits,
      syncLogId,
      sharedUnits,
      (progress: number) => {
        if (onProgress) {
          const percent = 60 + (progress / 100) * 10;
          onProgress(Math.round(percent), `Analyzing ${fmsTenants.length} tenants`);
        }
      }
    );
    changes.push(...tenantChanges);

    const tenantMappings = await this.models.entityMappingModel.findByFacility(facilityId, 'user');
    const occupancyContext = buildFmsOccupancyContext({
      fmsTenants,
      tenantChanges,
      mappedTenantExternalIds: tenantMappings.map((m) => m.external_id),
    });

    const unitChanges = await this.detectUnitChanges(
      facilityId,
      fmsUnits,
      fmsTenants,
      syncLogId,
      sharedUnits,
      occupancyContext,
      (progress: number) => {
        if (onProgress) {
          const percent = 70 + (progress / 100) * 8;
          onProgress(Math.round(percent), `Analyzing ${fmsUnits.length} units`);
        }
      }
    );
    changes.push(...unitChanges);

    if (onProgress) {
      onProgress(78, 'Change detection complete');
    }

    return changes;
  }

  /**
   * Detect tenant changes.
   */
  async detectTenantChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string,
    sharedUnits: any[],
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    const total = fmsTenants.length;
    let processed = 0;

    const fmsUnitsByExternalId = new Map(fmsUnits.map((u) => [u.externalId, u]));

    const existingMappings = await this.models.entityMappingModel.findByFacility(facilityId, 'user');
    const mappingsByExternalId = new Map(existingMappings.map((m) => [m.external_id, m]));

    const facilityUsers = await UserModel.findByRoleMinimalForFacility(UserRole.TENANT, facilityId);
    const mappedInternalIds = new Set(existingMappings.map((m) => m.internal_id));
    const facilityUserIds = new Set(facilityUsers.map((u) => u.id));

    const missingMappedIds = [...mappedInternalIds].filter((id) => !facilityUserIds.has(id));
    let supplementUsers: typeof facilityUsers = [];
    if (missingMappedIds.length > 0) {
      supplementUsers = (await UserModel.findByIds(missingMappedIds)) as any;
    }
    const allRelevantUsers = [...facilityUsers, ...supplementUsers];

    const { usersById, usersByEmail, usersByPhone, usersByLoginIdentifier } =
      buildFacilityUserLookupMaps(allRelevantUsers);

    const allFacilityAssignments = await this.models.unitAssignmentModel.findByFacilityId(facilityId);
    const assignmentsByTenantId = new Map<string, typeof allFacilityAssignments>();
    for (const assignment of allFacilityAssignments) {
      const tenantAssignments = assignmentsByTenantId.get(assignment.tenant_id) || [];
      tenantAssignments.push(assignment);
      assignmentsByTenantId.set(assignment.tenant_id, tenantAssignments);
    }

    const unitMappings = await this.models.entityMappingModel.findByFacility(facilityId, 'unit');
    const unitMappingsByExternalId = new Map(unitMappings.map((m) => [m.external_id, m]));
    const unitsById = new Map(sharedUnits.map((u: any) => [u.id, u]));

    const unitChangeContext = {
      assignmentsByTenantId,
      unitMappingsByExternalId,
      unitsById,
      fmsUnitsByExternalId,
    };

    const pendingInserts: Parameters<typeof this.models.changeModel.bulkCreate>[0] = [];
    const identityCollisions = new Map<
      string,
      { userLabel: string; tenants: FMSTenant[] }
    >();

    for (const fmsTenant of fmsTenants) {
      logger.debug(
        `[FMS-TENANT] Processing tenant: externalId=${fmsTenant.externalId}, email="${fmsTenant.email}"`
      );

      const validationErrors = validateFmsTenantSyncFields(fmsTenant);
      const isValid = validationErrors.length === 0;

      if (!isValid) {
        logger.warn(
          `[FMS-TENANT-INVALID] Tenant ${fmsTenant.externalId} flagged as INVALID: errors=${JSON.stringify(validationErrors)}`
        );
      }

      const mapping = mappingsByExternalId.get(fmsTenant.externalId);
      const existingUser = findExistingUserForFmsTenant(
        fmsTenant,
        mapping,
        usersById,
        usersByEmail,
        usersByPhone,
        usersByLoginIdentifier
      );

      processed++;
      if (onProgress && (processed % 10 === 0 || processed === total)) {
        onProgress(Math.round((processed / total) * 100));
      }

      if (!existingUser) {
        const { occupiableUnitIds, vacantConflicts } = partitionTenantUnitIdsByOccupancy(
          fmsTenant.unitIds,
          fmsUnitsByExternalId
        );
        const tenantForApply: FMSTenant = { ...fmsTenant, unitIds: occupiableUnitIds };
        const vacantConflictUnitNumbers = vacantConflicts.map((c) => c.unitNumber);
        const conflictNote =
          vacantConflictUnitNumbers.length > 0
            ? ` Skipped ledger assignment(s) to vacant FMS unit(s) ${vacantConflictUnitNumbers.join(', ')} — unit status is the source of truth; fix the ledger/status conflict in FMS.`
            : '';
        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          after_data: tenantForApply,
          required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ASSIGN_UNIT],
          impact_summary:
            `New tenant: ${fmsTenant.firstName || 'Unknown'} ${fmsTenant.lastName || 'Unknown'} (${formatFmsTenantContactLabel(fmsTenant)}) - Will be added to ${occupiableUnitIds.length} unit(s)` +
            conflictNote,
          is_valid: isValid,
          validation_errors: validationErrors,
        });

        if (vacantConflicts.length > 0) {
          const review = buildVacantLedgerAssignReview({
            tenant: fmsTenant,
            units: vacantConflicts,
          });
          const first = vacantConflicts[0];
          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_UNIT_CHANGED,
            entity_type: 'tenant',
            external_id: fmsTenant.externalId,
            after_data: {
              action: 'assign_unit',
              unitId: unitMappingsByExternalId.get(first.externalId)?.internal_id,
              unitNumber: first.unitNumber,
              unitNumbers: vacantConflicts.map((conflict) => conflict.unitNumber),
              externalUnitId: first.externalId,
              externalUnitIds: vacantConflicts.map((conflict) => conflict.externalId),
            },
            required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
            impact_summary: review.impact_summary,
            is_valid: false,
            validation_errors: review.validation_errors,
          });
        }
      } else {
        const user = existingUser;

        if (!mapping) {
          const otherMapping = existingMappings.find(
            (row) => row.internal_id === user.id && row.external_id !== fmsTenant.externalId
          );
          if (otherMapping) {
            const userLabel = user.email || user.phone_number || 'this account';
            const existing = identityCollisions.get(user.id);
            if (existing) {
              existing.tenants.push(fmsTenant);
            } else {
              identityCollisions.set(user.id, { userLabel, tenants: [fmsTenant] });
            }
            continue;
          }

          logger.warn(
            `[FMS] User ${user.email} exists but has no FMS mapping. Creating mapping.`,
            {
              fms_sync: true,
              sync_log_id: syncLogId,
              facility_id: facilityId,
              user_id: user.id,
              external_id: fmsTenant.externalId,
            }
          );

          const config = await this.models.fmsConfigModel.findByFacilityId(facilityId);
          await this.models.entityMappingModel.ensureMapping({
            facility_id: facilityId,
            entity_type: 'user',
            external_id: fmsTenant.externalId,
            internal_id: user.id,
            provider_type: config?.provider_type || 'generic_rest',
            metadata: {
              email: fmsTenant.email,
              phone: fmsTenant.phone,
              leaseStartDate: fmsTenant.leaseStartDate,
              leaseEndDate: fmsTenant.leaseEndDate,
            },
          });

          const newMapping = await this.models.entityMappingModel.findByExternalId(
            facilityId,
            'user',
            fmsTenant.externalId
          );
          if (newMapping) mappingsByExternalId.set(fmsTenant.externalId, newMapping);
        }

        let currentPhone: string | undefined;
        if (mapping) currentPhone = mapping.metadata?.phone as string | undefined;
        const currentEmail =
          (typeof mapping?.metadata?.email === 'string' ? mapping.metadata.email : undefined) ??
          user.email ??
          undefined;

        const facilityAssignmentCount = assignmentsByTenantId.get(user.id)?.length ?? 0;
        const needsFmsRestore = isFmsUserRemovedFromFacility(mapping, user, facilityAssignmentCount);
        const needsReactivation = isUserInactive(user);

        const normalizedUserEmail = (user.email || '').trim().toLowerCase();
        const normalizedFmsEmail = (fmsTenant.email || '').trim().toLowerCase();
        const normalizedUserPhone = (user.phone_number || '').trim();
        const normalizedFmsPhone = fmsTenant.phone?.trim() ? toE164(fmsTenant.phone) : '';
        const normalizedMetaPhone = currentPhone?.trim()
          ? toE164(currentPhone) || currentPhone.trim()
          : '';
        const emailChanged = normalizedUserEmail !== normalizedFmsEmail;
        const phoneChanged = (normalizedUserPhone || normalizedMetaPhone) !== normalizedFmsPhone;
        const needsPlaceholderUpgrade =
          isPlaceholderUser(user) && hasFmsTenantLoginIdentity(fmsTenant);

        const hasInfoChanges =
          user.first_name !== fmsTenant.firstName ||
          user.last_name !== fmsTenant.lastName ||
          emailChanged ||
          phoneChanged ||
          needsPlaceholderUpgrade;

        if (needsFmsRestore || hasInfoChanges || needsReactivation) {
          logger.debug(
            needsFmsRestore
              ? `[FMS] Tenant ${fmsTenant.email} restored in FMS`
              : needsReactivation && !hasInfoChanges
                ? `[FMS] Tenant ${fmsTenant.email} is inactive and present in FMS`
                : `[FMS] Tenant ${fmsTenant.email} has info changes`,
            { sync_log_id: syncLogId }
          );
          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_UPDATED,
            entity_type: 'tenant',
            external_id: fmsTenant.externalId,
            internal_id: user.id,
            before_data: {
              firstName: user.first_name,
              lastName: user.last_name,
              email: currentEmail ?? user.email ?? null,
              phone: currentPhone ?? user.phone_number ?? null,
            },
            after_data: fmsTenant,
            required_actions: [FMSChangeAction.UPDATE_USER],
            impact_summary:
              needsFmsRestore && !hasInfoChanges
                ? `Tenant restored in FMS: ${formatFmsTenantContactLabel(fmsTenant)}`
                : needsReactivation && !hasInfoChanges
                  ? `Reactivate tenant present in FMS: ${formatFmsTenantContactLabel(fmsTenant)}`
                  : `Updated tenant info for: ${formatFmsTenantContactLabel(fmsTenant)}`,
            is_valid: isValid,
            validation_errors: validationErrors,
          });
        }

        this.collectTenantUnitChanges(
          facilityId,
          user.id,
          fmsTenant,
          syncLogId,
          unitChangeContext,
          pendingInserts
        );
      }
    }

    for (const group of identityCollisions.values()) {
      const review = buildIdentityCollisionReview({
        userLabel: group.userLabel,
        tenants: group.tenants,
      });
      const primary = group.tenants[0];
      pendingInserts.push({
        sync_log_id: syncLogId,
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: primary.externalId,
        after_data: {
          ...primary,
          collidingExternalIds: review.collidingExternalIds,
          collidingTenants: group.tenants.map((tenant) => formatFmsTenantContactLabel(tenant)),
        },
        required_actions: [FMSChangeAction.CREATE_USER],
        impact_summary: review.impact_summary,
        is_valid: false,
        validation_errors: review.validation_errors,
      });
    }

    const fmsTenantExtIds = new Set(fmsTenants.map((t) => t.externalId));
    for (const mapping of existingMappings) {
      if (!fmsTenantExtIds.has(mapping.external_id)) {
        const user = usersById.get(mapping.internal_id);
        const facilityAssignmentCount = assignmentsByTenantId.get(mapping.internal_id)?.length ?? 0;

        if (isFmsUserRemovedFromFacility(mapping, user, facilityAssignmentCount)) {
          if (!isFmsMappingMarkedRemoved(mapping.metadata)) {
            await this.models.entityMappingModel.updateMetadata(
              mapping.id,
              stampFmsMappingRemoved(mapping.metadata)
            );
          }
          logger.debug('[FMS] Skipping tenant_removed — already removed from this facility FMS', {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            external_id: mapping.external_id,
            internal_id: mapping.internal_id,
          });
          continue;
        }

        if (user) {
          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_REMOVED,
            entity_type: 'tenant',
            external_id: mapping.external_id,
            internal_id: mapping.internal_id,
            before_data: user,
            after_data: null as any,
            required_actions: [FMSChangeAction.REMOVE_ACCESS, FMSChangeAction.DEACTIVATE_USER],
            impact_summary: `Tenant removed: ${user.email} - Will be deactivated and access revoked from all units`,
            is_valid: true,
          });
        }
      }
    }

    const changes =
      pendingInserts.length > 0 ? await this.models.changeModel.bulkCreate(pendingInserts) : [];

    logger.info(`[FMS] Tenant detection complete: ${changes.length} changes from ${total} tenants`, {
      fms_sync: true,
      sync_log_id: syncLogId,
      facility_id: facilityId,
    });

    return changes;
  }

  /**
   * Collect unit assignment change data for a tenant into the pending inserts array.
   */
  collectTenantUnitChanges(
    facilityId: string,
    tenantId: string,
    fmsTenant: FMSTenant,
    syncLogId: string,
    context: {
      assignmentsByTenantId: Map<string, any[]>;
      unitMappingsByExternalId: Map<string, any>;
      unitsById: Map<string, any>;
      fmsUnitsByExternalId: Map<string, FMSUnit>;
    },
    pendingInserts: Parameters<typeof this.models.changeModel.bulkCreate>[0]
  ): void {
    const currentAssignments = context.assignmentsByTenantId.get(tenantId) || [];
    const currentUnitIds = new Set(currentAssignments.map((a) => a.unit_id));

    const fmsUnitMappings = fmsTenant.unitIds
      .map((extId) => context.unitMappingsByExternalId.get(extId))
      .filter((m) => m !== undefined);

    const fmsInternalUnitIds = new Set(
      fmsUnitMappings.filter((m) => m !== null).map((m) => m!.internal_id)
    );

    const vacantAssigns: Array<{
      mapping: NonNullable<(typeof fmsUnitMappings)[number]>;
      unit: { unit_number: string };
      status: string;
    }> = [];

    for (const mapping of fmsUnitMappings) {
      if (mapping && !currentUnitIds.has(mapping.internal_id)) {
        const unit = context.unitsById.get(mapping.internal_id);
        if (!unit || unit.facility_id !== facilityId) continue;

        const fmsUnit = context.fmsUnitsByExternalId.get(mapping.external_id);
        const blockers = resolveLedgerAssignAgainstUnitStatus({
          unitNumber: unit.unit_number,
          fmsUnitStatus: fmsUnit?.status,
          tenant: fmsTenant,
        });

        if (blockers.length > 0) {
          vacantAssigns.push({
            mapping,
            unit,
            status: String(fmsUnit?.status ?? 'available'),
          });
          continue;
        }

        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          after_data: {
            action: 'assign_unit',
            unitId: mapping.internal_id,
            unitNumber: unit.unit_number,
          },
          required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
          impact_summary: `Assign ${fmsTenant.email} to unit ${unit.unit_number} - Gateway access will be granted`,
          is_valid: true,
        });
      }
    }

    if (vacantAssigns.length > 0) {
      const review = buildVacantLedgerAssignReview({
        tenant: fmsTenant,
        units: vacantAssigns.map((row) => ({
          unitNumber: row.unit.unit_number,
          status: row.status,
        })),
      });
      const first = vacantAssigns[0];
      pendingInserts.push({
        sync_log_id: syncLogId,
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        entity_type: 'tenant',
        external_id: fmsTenant.externalId,
        internal_id: tenantId,
        after_data: {
          action: 'assign_unit',
          unitId: first.mapping.internal_id,
          unitNumber: first.unit.unit_number,
          unitNumbers: vacantAssigns.map((row) => row.unit.unit_number),
          unitIds: vacantAssigns.map((row) => row.mapping.internal_id),
        },
        required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
        impact_summary: review.impact_summary,
        is_valid: false,
        validation_errors: review.validation_errors,
      });
    }

    const externalIdByInternalUnitId = new Map(
      [...context.unitMappingsByExternalId.values()].map((m) => [m.internal_id, m.external_id])
    );

    const occupiedUnassigns: Array<{
      assignment: (typeof currentAssignments)[number];
      unitNumber: string;
    }> = [];

    for (const assignment of currentAssignments) {
      if (!fmsInternalUnitIds.has(assignment.unit_id)) {
        const unit = context.unitsById.get(assignment.unit_id);
        const externalUnitId = externalIdByInternalUnitId.get(assignment.unit_id);
        const fmsUnit = externalUnitId
          ? context.fmsUnitsByExternalId.get(externalUnitId)
          : undefined;
        const unitNumber = unit?.unit_number || assignment.unit_id;
        const blockers = resolveLedgerUnassignAgainstUnitStatus({
          unitNumber,
          fmsUnitStatus: fmsUnit?.status,
          fmsUnitTenantId: fmsUnit?.tenantId,
          tenantExternalId: fmsTenant.externalId,
          tenant: fmsTenant,
        });

        if (blockers.length > 0) {
          occupiedUnassigns.push({ assignment, unitNumber });
          continue;
        }

        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          before_data: {
            action: 'unassign_unit',
            unitId: assignment.unit_id,
            unitNumber: unit?.unit_number,
          },
          after_data: null as any,
          required_actions: [FMSChangeAction.UNASSIGN_UNIT, FMSChangeAction.REMOVE_ACCESS],
          impact_summary: `Remove ${fmsTenant.email} from unit ${unitNumber} - Gateway access will be revoked`,
          is_valid: true,
        });
      }
    }

    if (occupiedUnassigns.length > 0) {
      const review = buildOccupiedLedgerUnassignReview({
        tenant: fmsTenant,
        units: occupiedUnassigns.map((row) => ({ unitNumber: row.unitNumber })),
      });
      const first = occupiedUnassigns[0];
      pendingInserts.push({
        sync_log_id: syncLogId,
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        entity_type: 'tenant',
        external_id: fmsTenant.externalId,
        internal_id: tenantId,
        before_data: {
          action: 'unassign_unit',
          unitId: first.assignment.unit_id,
          unitNumber: first.unitNumber,
          unitNumbers: occupiedUnassigns.map((row) => row.unitNumber),
        },
        after_data: null as any,
        required_actions: [FMSChangeAction.UNASSIGN_UNIT, FMSChangeAction.REMOVE_ACCESS],
        impact_summary: review.impact_summary,
        is_valid: false,
        validation_errors: review.validation_errors,
      });
    }
  }

  /**
   * Detect unit changes.
   */
  async detectUnitChanges(
    facilityId: string,
    fmsUnits: FMSUnit[],
    fmsTenants: FMSTenant[],
    syncLogId: string,
    sharedUnits: any[],
    occupancyContext: FmsOccupancyContext,
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    const total = fmsUnits.length;
    let processed = 0;

    const existingMappings = await this.models.entityMappingModel.findByFacility(facilityId, 'unit');
    const mappingsByExternalId = new Map(existingMappings.map((m) => [m.external_id, m]));

    const existingUnits = sharedUnits;
    const unitsByNumber = new Map(existingUnits.map((u: any) => [u.unit_number, u]));
    const unitsById = new Map(existingUnits.map((u: any) => [u.id, u]));

    const ledgerTenantLabelsByUnitExternalId = new Map<string, string[]>();
    for (const tenant of fmsTenants) {
      const label = formatFmsTenantContactLabel(tenant);
      const name = [tenant.firstName, tenant.lastName].filter(Boolean).join(' ').trim();
      const display = name ? `${name} (${label})` : label;
      for (const unitExtId of tenant.unitIds) {
        const list = ledgerTenantLabelsByUnitExternalId.get(unitExtId) || [];
        list.push(display);
        ledgerTenantLabelsByUnitExternalId.set(unitExtId, list);
      }
    }

    const pendingInserts: Parameters<typeof this.models.changeModel.bulkCreate>[0] = [];

    for (const fmsUnit of fmsUnits) {
      const mapping = mappingsByExternalId.get(fmsUnit.externalId);
      let existingUnit = mapping ? unitsById.get(mapping.internal_id) : null;

      logger.debug(`[FMS] Checking unit ${fmsUnit.unitNumber}`, {
        fms_sync: true,
        sync_log_id: syncLogId,
        external_id: fmsUnit.externalId,
        has_mapping: !!mapping,
        found_by_mapping: !!existingUnit,
      });

      if (mapping && !existingUnit) {
        logger.warn(
          `[FMS] Stale mapping detected: unit ${mapping.internal_id} not found in this facility`,
          {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            external_id: fmsUnit.externalId,
            mapping_internal_id: mapping.internal_id,
            unit_number: fmsUnit.unitNumber,
          }
        );
        existingUnit = unitsByNumber.get(fmsUnit.unitNumber);
      } else if (mapping && existingUnit) {
        const numberMatch = existingUnit.unit_number === fmsUnit.unitNumber;
        if (!numberMatch) {
          const correctUnit = unitsByNumber.get(fmsUnit.unitNumber);
          if (correctUnit) {
            logger.warn('[FMS] Mapping points to a different unit number. Repairing mapping.', {
              fms_sync: true,
              sync_log_id: syncLogId,
              facility_id: facilityId,
              external_id: fmsUnit.externalId,
              mapping_internal_id: mapping.internal_id,
              mapped_unit_number: existingUnit.unit_number,
              expected_unit_number: fmsUnit.unitNumber,
              correct_internal_id: correctUnit.id,
            });
            await this.models.entityMappingModel.updateInternalId(mapping.id, correctUnit.id);
            existingUnit = correctUnit;
            mappingsByExternalId.set(fmsUnit.externalId, {
              ...mapping,
              internal_id: correctUnit.id,
              updated_at: new Date(),
            } as any);
          }
        }
      } else if (!mapping) {
        existingUnit = unitsByNumber.get(fmsUnit.unitNumber);
      }

      processed++;
      if (onProgress && (processed % 10 === 0 || processed === total)) {
        onProgress(Math.round((processed / total) * 100));
      }

      if (!existingUnit) {
        logger.debug(`[FMS] Detected new unit to add: ${fmsUnit.unitNumber}`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          external_id: fmsUnit.externalId,
        });

        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_ADDED,
          entity_type: 'unit',
          external_id: fmsUnit.externalId,
          after_data: fmsUnit,
          required_actions: [],
          impact_summary: `New unit: ${fmsUnit.unitNumber} - Will be added to facility`,
          is_valid: true,
        });
      } else if (!mapping || mapping.internal_id !== existingUnit.id) {
        const reason = !mapping ? 'no mapping' : 'stale mapping';
        logger.info(`[FMS] Unit ${fmsUnit.unitNumber} exists (${reason}), no detection-side repair`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
          unit_id: existingUnit.id,
          external_id: fmsUnit.externalId,
          mapping_internal_id: mapping?.internal_id,
        });
      } else {
        const unit = existingUnit;
        const hasChanges = unit.status !== fmsUnit.status || unit.unit_type !== fmsUnit.unitType;

        if (hasChanges) {
          logger.debug(`[FMS] Unit ${fmsUnit.unitNumber} has data changes`, { sync_log_id: syncLogId });

          const occupancyBlockers = resolveOccupiedUnitBlockers(fmsUnit, unit.status, occupancyContext);
          if (shouldOmitOccupiedUnitReview(fmsUnit, occupancyBlockers, occupancyContext)) {
            continue;
          }
          if (occupancyBlockers.length > 0) {
            logger.warn(`[FMS] Unit ${fmsUnit.unitNumber} cannot be marked occupied yet`, {
              fms_sync: true,
              sync_log_id: syncLogId,
              facility_id: facilityId,
              external_id: fmsUnit.externalId,
              reasons: occupancyBlockers,
            });
          }

          let impactSummary = `Update unit ${fmsUnit.unitNumber}`;
          if (isFmsUnitVacantStatus(fmsUnit.status) && occupancyBlockers.length === 0) {
            const ledgerNote = formatVacantUnitLedgerConflictNote(
              fmsUnit.unitNumber,
              ledgerTenantLabelsByUnitExternalId.get(fmsUnit.externalId) || []
            );
            if (ledgerNote) {
              impactSummary = ledgerNote;
            }
          }

          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_UPDATED,
            entity_type: 'unit',
            external_id: fmsUnit.externalId,
            internal_id: unit.id,
            before_data: { status: unit.status, unitType: unit.unit_type },
            after_data: fmsUnit,
            required_actions: [],
            impact_summary: impactSummary,
            is_valid: occupancyBlockers.length === 0,
            validation_errors: occupancyBlockers.length > 0 ? occupancyBlockers : undefined,
          });
        }
      }
    }

    const changes =
      pendingInserts.length > 0 ? await this.models.changeModel.bulkCreate(pendingInserts) : [];

    logger.info(`[FMS] Unit detection complete: ${changes.length} changes from ${total} units`, {
      fms_sync: true,
      sync_log_id: syncLogId,
      facility_id: facilityId,
    });

    return changes;
  }
}
