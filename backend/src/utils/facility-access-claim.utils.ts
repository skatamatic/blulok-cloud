import { Response } from 'express';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';

/**
 * JWT facility-claim check for facility-scoped roles.
 * Global admins always pass. Prefer AuthService.canAccessFacility for
 * authoritative DB-backed checks when the request path can afford async.
 */
export function hasJwtFacilityClaim(
  user: { role: UserRole; facilityIds?: string[] },
  facilityId: string,
): boolean {
  if (!AuthService.isFacilityScoped(user.role)) {
    return true;
  }
  return Array.isArray(user.facilityIds) && user.facilityIds.includes(facilityId);
}

/** Send 403 and return false when the JWT claim does not include the facility. */
export function assertJwtFacilityClaim(
  res: Response,
  user: { role: UserRole; facilityIds?: string[] },
  facilityId: string,
  message = 'Insufficient permissions - facility access required',
): boolean {
  if (hasJwtFacilityClaim(user, facilityId)) {
    return true;
  }
  res.status(403).json({ success: false, message });
  return false;
}
