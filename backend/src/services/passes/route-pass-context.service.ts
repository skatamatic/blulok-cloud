import { Knex } from 'knex';
import { UserModel, User } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';

export class RoutePassError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ResolvedRoutePassScope {
  role: UserRole;
  facilityIds?: string[];
  facilityId?: string;
}

/**
 * Returns true when the user has a current primary assignment or active share in the facility.
 */
export async function userHasUnitEntitlementInFacility(
  db: Knex,
  userId: string,
  facilityId: string,
): Promise<boolean> {
  const assigned = await db('unit_assignments as ua')
    .join('units as u', 'u.id', 'ua.unit_id')
    .where('ua.tenant_id', userId)
    .where('u.facility_id', facilityId)
    .where(function (this: Knex.QueryBuilder) {
      this.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', db.fn.now());
    })
    .first();

  if (assigned) return true;

  const shared = await db('key_sharing as ks')
    .join('units as u', 'u.id', 'ks.unit_id')
    .where('ks.shared_with_user_id', userId)
    .where('u.facility_id', facilityId)
    .where('ks.is_active', true)
    .where(function (this: Knex.QueryBuilder) {
      this.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', db.fn.now());
    })
    .first();

  return !!shared;
}

/**
 * Load the user's current role/active flag and resolve facility scope from the database.
 * Session JWT claims (role, facilityIds) must not influence route pass contents.
 */
export async function resolveAuthoritativeRoutePassScope(
  db: Knex,
  userId: string,
  requestedFacilityId?: string,
): Promise<ResolvedRoutePassScope> {
  const user = await UserModel.findById(userId) as User | undefined;
  if (!user) {
    throw new RoutePassError('User not found', 404);
  }
  if (!user.is_active) {
    throw new RoutePassError('User account is inactive', 403);
  }

  const role = user.role as UserRole;
  let facilityIds: string[] | undefined;

  if (role === UserRole.FACILITY_ADMIN) {
    facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
  } else if (role === UserRole.TENANT || role === UserRole.MAINTENANCE) {
    facilityIds = undefined;
  }

  if (!requestedFacilityId) {
    return { role, facilityIds };
  }

  if (AuthService.canAccessAllFacilities(role)) {
    const facility = await db('facilities').select('id').where('id', requestedFacilityId).first();
    if (!facility) {
      throw new RoutePassError('Requested facility was not found', 404);
    }
  } else if (role === UserRole.FACILITY_ADMIN) {
    const currentFacilityIds = facilityIds ?? [];
    if (!currentFacilityIds.includes(requestedFacilityId)) {
      throw new RoutePassError('Access denied to requested facility', 403);
    }
  } else if (role === UserRole.TENANT || role === UserRole.MAINTENANCE) {
    const entitled = await userHasUnitEntitlementInFacility(db, userId, requestedFacilityId);
    if (!entitled) {
      throw new RoutePassError('Access denied to requested facility', 403);
    }
  } else {
    throw new RoutePassError('Access denied to requested facility', 403);
  }

  return {
    role,
    facilityIds: [requestedFacilityId],
    facilityId: requestedFacilityId,
  };
}
