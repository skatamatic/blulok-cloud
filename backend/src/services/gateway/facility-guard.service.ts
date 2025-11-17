import { UserRole } from '@/types/auth.types';

export class FacilityGuardService {
  public static ensureWithinScope(userRole: UserRole, connectionFacilityId: string, path: string, body?: any): void {
    if (userRole !== UserRole.FACILITY_ADMIN) return;
    const targetFacility = extractFacilityIdFromPathOrBody(path, body);
    if (targetFacility && targetFacility !== connectionFacilityId) {
      const err: any = new Error('Forbidden facility scope');
      err.response = { status: 403, data: { error: 'Forbidden facility scope' } };
      throw err;
    }
  }
}

function extractFacilityIdFromPathOrBody(path: string, body: any): string | null {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'facilities' || p === 'facility');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  if (body && typeof body === 'object') {
    if (typeof body.facility_id === 'string') return body.facility_id;
    if (typeof body.facilityId === 'string') return body.facilityId;
  }
  return null;
}


