import { FacilityGuardService } from '@/services/gateway/facility-guard.service';
import { UserRole } from '@/types/auth.types';

describe('FacilityGuardService', () => {
  it('allows facility_admin when target facility matches connection', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/facilities/fac-a/units',
      ),
    ).not.toThrow();
  });

  it('allows facility_admin when path has no facility target', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/devices/blulok/dev-1',
      ),
    ).not.toThrow();
  });

  it('throws 403 for facility_admin crossing facility in path', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/facilities/fac-b/units',
      ),
    ).toThrow(/Forbidden facility scope/);

    try {
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/facilities/fac-b/units',
      );
    } catch (err: unknown) {
      expect((err as { response?: { status?: number } }).response?.status).toBe(403);
    }
  });

  it('throws 403 when body.facility_id targets another facility', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/internal/gateway/devices/inventory',
        { facility_id: 'fac-b' },
      ),
    ).toThrow(/Forbidden facility scope/);
  });

  it('throws 403 when query facilityId targets another facility', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/devices',
        undefined,
        { facilityId: 'fac-b' },
      ),
    ).toThrow(/Forbidden facility scope/);
  });

  it('extracts facility_id from path query string', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.FACILITY_ADMIN,
        'fac-a',
        '/devices?facility_id=fac-b',
      ),
    ).toThrow(/Forbidden facility scope/);
  });

  it('does not enforce scope for admin roles', () => {
    expect(() =>
      FacilityGuardService.ensureWithinScope(
        UserRole.ADMIN,
        'fac-a',
        '/facilities/fac-b/units',
        { facility_id: 'fac-b' },
      ),
    ).not.toThrow();
  });
});
