/**
 * Real AuthService + mocked UserDeviceModel (dynamic import in login).
 */
jest.unmock('@/services/auth.service');

const findActiveByUserAndAppDeviceId = jest.fn();

jest.mock('@/models/user-device.model', () => ({
  UserDeviceModel: jest.fn().mockImplementation(() => ({
    findActiveByUserAndAppDeviceId,
  })),
}));

import bcrypt from 'bcrypt';
import { AuthService } from '@/services/auth.service';

describe('AuthService.login with X-App-Device-Id (real AuthService)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets key_generation_required when device id is new (no active registration)', async () => {
    findActiveByUserAndAppDeviceId.mockResolvedValue(undefined);

    const result = await AuthService.login(
      { identifier: 'tenant@test.com', password: 'password123' },
      { appDeviceId: 'new-device-uuid', appPlatform: 'ios' }
    );

    expect(result.success).toBe(true);
    expect(findActiveByUserAndAppDeviceId).toHaveBeenCalledWith('tenant-1', 'new-device-uuid');
    expect((result as { key_generation_required?: boolean }).key_generation_required).toBe(true);
  });

  it('omits key_generation_required when device is already registered', async () => {
    findActiveByUserAndAppDeviceId.mockResolvedValue({ id: 'ud-1' });

    const result = await AuthService.login(
      { identifier: 'tenant@test.com', password: 'password123' },
      { appDeviceId: 'known-device-uuid', appPlatform: 'android' }
    );

    expect(result.success).toBe(true);
    expect(findActiveByUserAndAppDeviceId).toHaveBeenCalledWith('tenant-1', 'known-device-uuid');
    expect((result as { key_generation_required?: boolean }).key_generation_required).toBeUndefined();
  });
});
