/**
 * FMS invite policy helpers.
 *
 * Controls when newly created / upgraded FMS tenants receive invite SMS/email.
 * Default when unset is NONE (no automatic invites) to avoid spam during
 * partial facility adoption.
 */

import { DatabaseService } from '@/services/database.service';
import { isPlaceholderUser } from '@/services/fms/fms-placeholder-user.utils';
import {
  FMSInvitePolicy,
  FMSProviderConfig,
} from '@/types/fms.types';
import type { User } from '@/models/user.model';

export type FmsInviteDecision =
  | 'send'
  | 'defer_policy'
  | 'defer_awaiting_device'
  | 'skip_placeholder'
  | 'skip_no_contact';

type SyncSettings = FMSProviderConfig['syncSettings'];

/**
 * Resolve invite policy from facility FMS sync settings.
 * Unset / unknown values default to NONE.
 */
export function resolveFmsInvitePolicy(
  syncSettings: SyncSettings | undefined | null,
): FMSInvitePolicy {
  const raw = syncSettings?.invitePolicy;
  if (raw === FMSInvitePolicy.ALL) return FMSInvitePolicy.ALL;
  if (raw === FMSInvitePolicy.DEVICE_EQUIPPED) return FMSInvitePolicy.DEVICE_EQUIPPED;
  return FMSInvitePolicy.NONE;
}

/**
 * True when the tenant is assigned to at least one unit in the facility
 * that has a BluLok device attached.
 */
export async function isDeviceEquippedTenant(
  userId: string,
  facilityId: string,
): Promise<boolean> {
  const knex = DatabaseService.getInstance().connection;
  const row = await knex('unit_assignments as ua')
    .join('units as u', 'u.id', 'ua.unit_id')
    .join('blulok_devices as bd', 'bd.unit_id', 'u.id')
    .where('ua.tenant_id', userId)
    .where('u.facility_id', facilityId)
    .first('bd.id');
  return Boolean(row);
}

/**
 * Decide whether to send, defer, or skip an invite for an FMS-created user.
 *
 * Callers should pass the post-assignment user (unit_assignments already written)
 * when evaluating DEVICE_EQUIPPED eligibility.
 */
export async function evaluateFmsInvite(
  user: Pick<User, 'id' | 'email' | 'phone_number' | 'is_placeholder' | 'login_identifier'>,
  facilityId: string,
  syncSettings: SyncSettings | undefined | null,
): Promise<FmsInviteDecision> {
  if (isPlaceholderUser(user as User)) {
    return 'skip_placeholder';
  }
  if (!user.email && !user.phone_number) {
    return 'skip_no_contact';
  }

  const policy = resolveFmsInvitePolicy(syncSettings);

  if (policy === FMSInvitePolicy.NONE) {
    return 'defer_policy';
  }

  if (policy === FMSInvitePolicy.ALL) {
    return 'send';
  }

  // DEVICE_EQUIPPED
  const equipped = await isDeviceEquippedTenant(user.id, facilityId);
  return equipped ? 'send' : 'defer_awaiting_device';
}
