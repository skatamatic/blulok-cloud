import { UserRole } from '@/types/auth.types';

export class FacilityGuardService {
  public static ensureWithinScope(
    userRole: UserRole,
    connectionFacilityId: string,
    path: string,
    body?: any,
    query?: any,
  ): void {
    // FACILITY_ADMIN (including ZTP gateway principals) cannot proxy cross-facility
    if (userRole !== UserRole.FACILITY_ADMIN) return;
    const targetFacility = extractFacilityId(path, body, query);
    if (targetFacility && targetFacility !== connectionFacilityId) {
      const err: any = new Error('Forbidden facility scope');
      err.response = { status: 403, data: { error: 'Forbidden facility scope' } };
      throw err;
    }
  }
}

function extractFacilityId(path: string, body: any, query?: any): string | null {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'facilities' || p === 'facility');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  const queryFromPath = (() => {
    try {
      const qs = path.includes('?') ? path.split('?')[1] : '';
      const parsed = new URLSearchParams(qs);
      return parsed.get('facility_id') || parsed.get('facilityId');
    } catch {
      return null;
    }
  })();
  if (queryFromPath) return queryFromPath;
  if (query && typeof query === 'object') {
    if (typeof query.facility_id === 'string') return query.facility_id;
    if (typeof query.facilityId === 'string') return query.facilityId;
  }
  if (body && typeof body === 'object') {
    if (typeof body.facility_id === 'string') return body.facility_id;
    if (typeof body.facilityId === 'string') return body.facilityId;
  }
  return null;
}


