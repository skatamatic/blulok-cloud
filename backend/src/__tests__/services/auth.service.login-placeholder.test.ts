/**
 * AuthService rejects FMS placeholder tenants at login.
 */
jest.unmock('@/services/auth.service');

import bcrypt from 'bcrypt';
import { AuthService } from '@/services/auth.service';

describe('AuthService.login — FMS placeholder tenants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects login for placeholder users with generic invalid credentials', async () => {
    const result = await AuthService.login({
      identifier: 'fms-ph:facility-1:ext-placeholder-1',
      password: 'anything',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid email or password');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});
