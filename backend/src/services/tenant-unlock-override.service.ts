/**
 * Tenant Unlock Override Service
 *
 * Validates and resolves tenant unlock override requirements for remote unlock operations.
 * When unlocking an occupied unit remotely, non-occupant users must provide a valid
 * override reason unless explicitly bypassed by configuration.
 */

import { Knex } from 'knex';
import type { TenantUnlockOverrideReasonCode } from '@/constants/tenant-unlock-override.constants';

export interface ResolveTenantUnlockOverrideParams {
  knex: Knex;
  unitId: string;
  userId: string;
  reasonRaw: unknown;
  notesRaw?: unknown;
}

export interface TenantUnlockOverride {
  reason: string;
  reasonLabel: string;
  notes?: string;
}

export type ResolveTenantUnlockOverrideResult =
  | { ok: true; override?: TenantUnlockOverride }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Resolves tenant unlock override requirements for a remote unlock operation.
 *
 * Validates whether the user unlocking a BluLok device in an occupied unit
 * needs to provide an override reason. Returns either the validated override
 * or an error response if requirements are not met.
 *
 * @param params - Override resolution parameters
 * @returns Result indicating success with optional override, or failure with HTTP response details
 */
export async function resolveTenantUnlockOverrideForRemoteUnlock(
  params: ResolveTenantUnlockOverrideParams,
): Promise<ResolveTenantUnlockOverrideResult> {
  const { knex, unitId, userId, reasonRaw, notesRaw } = params;

  const { unitHasTenant } = await import('@/utils/unit-has-tenant.utils');
  const { userIsUnitOccupantOrShareRecipient } = await import(
    '@/utils/unit-occupant-access.utils'
  );

  const hasTenant = await unitHasTenant(knex, unitId);
  if (!hasTenant) {
    return { ok: true };
  }

  const isOccupant = await userIsUnitOccupantOrShareRecipient(knex, unitId, userId);
  if (isOccupant) {
    return { ok: true };
  }

  // Non-occupant unlocking an occupied unit
  const {
    OCCUPIED_UNIT_OVERRIDE_REQUIRED,
    isTenantUnlockOverrideReasonCode,
    labelForTenantUnlockOverrideReason,
  } = await import('@/constants/tenant-unlock-override.constants');

  const hasReasonField =
    reasonRaw !== undefined && reasonRaw !== null && String(reasonRaw).trim() !== '';

  if (hasReasonField) {
    if (!isTenantUnlockOverrideReasonCode(reasonRaw)) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          message: 'Invalid tenant_override_reason',
          code: 'TENANT_UNLOCK_OVERRIDE_INVALID',
        },
      };
    }

    const notesStr =
      typeof notesRaw === 'string' ? notesRaw.trim() : '';
    const reason = reasonRaw as TenantUnlockOverrideReasonCode;

    return {
      ok: true,
      override: {
        reason,
        reasonLabel: labelForTenantUnlockOverrideReason(reason),
        ...(notesStr ? { notes: notesStr } : {}),
      },
    };
  }

  // No reason provided
  if (OCCUPIED_UNIT_OVERRIDE_REQUIRED) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'This unit has a tenant. Select a reason before unlocking remotely.',
        code: 'TENANT_UNLOCK_OVERRIDE_REQUIRED',
      },
    };
  }

  return { ok: true };
}
