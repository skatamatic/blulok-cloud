import { normalizeRoutePassUserRole, PassesService } from '@/services/passes.service';
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
});


