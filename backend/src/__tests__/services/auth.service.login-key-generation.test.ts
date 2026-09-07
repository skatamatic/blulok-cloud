/**
 * Exercises real AuthService.login device / key-generation flags.
 * Global setup mocks AuthService for route tests; unmock here.
 */
jest.unmock('@/services/auth.service');

import bcrypt from 'bcrypt';
import { AuthService } from '@/services/auth.service';

describe('AuthService.login key_generation_required (real implementation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('without X-App-Device-Id (web / gateway tools)', () => {
    it('does not set key_generation_required for facility_admin', async () => {
      const result = await AuthService.login(
        { identifier: 'facilityadmin@test.com', password: 'password123' },
        undefined
      );
      expect(result.success).toBe(true);
      expect((result as { key_generation_required?: boolean }).key_generation_required).toBeUndefined();
    });

    it('does not set key_generation_required for admin', async () => {
      const result = await AuthService.login(
        { identifier: 'admin@test.com', password: 'password123' },
        undefined
      );
      expect(result.success).toBe(true);
      expect((result as { key_generation_required?: boolean }).key_generation_required).toBeUndefined();
    });

    it('does not set key_generation_required for dev_admin', async () => {
      const result = await AuthService.login(
        { identifier: 'devadmin@test.com', password: 'password123' },
        undefined
      );
      expect(result.success).toBe(true);
      expect((result as { key_generation_required?: boolean }).key_generation_required).toBeUndefined();
    });

    it('sets key_generation_required for tenant', async () => {
      const result = await AuthService.login(
        { identifier: 'tenant@test.com', password: 'password123' },
        undefined
      );
      expect(result.success).toBe(true);
      expect((result as { key_generation_required?: boolean }).key_generation_required).toBe(true);
    });

    it('sets key_generation_required for maintenance', async () => {
      const result = await AuthService.login(
        { identifier: 'maintenance@test.com', password: 'password123' },
        undefined
      );
      expect(result.success).toBe(true);
      expect((result as { key_generation_required?: boolean }).key_generation_required).toBe(true);
    });
  });
});
