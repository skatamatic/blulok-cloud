import { normalizeRoutePassUserRole, PassesService } from '@/services/passes.service';
import type { RoutePassFacilitySchedule } from '@/services/passes/route-pass-schedules';
import { UserRole } from '@/types/auth.types';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

describe('PassesService', () => {
  it('normalizes role strings to lowercase underscore form', () => {
    expect(normalizeRoutePassUserRole(UserRole.FACILITY_ADMIN)).toBe('facility_admin');
    expect(normalizeRoutePassUserRole('  DEV_ADMIN  ')).toBe('dev_admin');
    expect(normalizeRoutePassUserRole('Facility Admin')).toBe('facility_admin');
  });

  it('issues a route pass containing device_pubkey and claims', async () => {
    const token = await PassesService.issueRoutePass({
      userId: 'user-xyz',
      devicePublicKey: 'cHVibGljS2V5',
      audiences: ['lock:serial-1'],
      userRole: UserRole.TENANT,
    });
    const payload = await Ed25519Service.verifyJwt(token);
    expect(payload.sub).toBe('user-xyz');
    expect(payload.device_pubkey).toBe('cHVibGljS2V5');
    expect(payload.user_role).toBe('tenant');
    expect(Array.isArray(payload.aud)).toBe(true);
  });

  it('embeds schedules claim when provided', async () => {
    const schedules: RoutePassFacilitySchedule[] = [
      {
        f: '550e8400-e29b-41d4-a716-446655440000',
        w: [[[[1, 5]], '09:00', '17:00']],
      },
    ];
    const token = await PassesService.issueRoutePass({
      userId: 'user-xyz',
      devicePublicKey: 'cHVibGljS2V5',
      audiences: ['lock:serial-1'],
      schedules,
      userRole: UserRole.TENANT,
    });
    const payload = await Ed25519Service.verifyJwt(token);
    expect(payload.schedules).toEqual(schedules);
  });
});


