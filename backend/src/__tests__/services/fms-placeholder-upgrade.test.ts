/**
 * Tests for shared placeholder upgrade prepare/invite helpers.
 */
jest.mock('@/models/user.model', () => ({
  UserModel: {
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    findByLoginIdentifier: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn() },
}));

import { UserModel } from '@/models/user.model';
import {
  preparePlaceholderUpgrade,
  requirePlaceholderUpgradeUpdates,
  queueInviteAfterPlaceholderUpgrade,
} from '@/services/fms/fms-placeholder-upgrade';

const findByEmail = UserModel.findByEmail as jest.Mock;
const findByPhone = UserModel.findByPhone as jest.Mock;
const findByLoginIdentifier = UserModel.findByLoginIdentifier as jest.Mock;

describe('fms-placeholder-upgrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findByEmail.mockResolvedValue(undefined);
    findByPhone.mockResolvedValue(undefined);
    findByLoginIdentifier.mockResolvedValue(undefined);
  });

  describe('preparePlaceholderUpgrade', () => {
    it('returns no_contact when neither email nor phone is provided', async () => {
      const result = await preparePlaceholderUpgrade('u1', {});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('no_contact');
    });

    it('returns updates when email is unique', async () => {
      const result = await preparePlaceholderUpgrade('u1', { email: 'a@b.com' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updates.email).toBe('a@b.com');
        expect(result.updates.is_placeholder).toBe(false);
        expect(result.updates.login_identifier).toBe('a@b.com');
      }
    });

    it('returns email_in_use when email belongs to another user', async () => {
      findByEmail.mockResolvedValue({ id: 'other' });
      const result = await preparePlaceholderUpgrade('u1', { email: 'a@b.com' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('email_in_use');
    });

    it('returns login_in_use when login_identifier belongs to another user', async () => {
      findByLoginIdentifier.mockResolvedValue({ id: 'other' });
      const result = await preparePlaceholderUpgrade('u1', { phoneE164: '+15551234567' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('login_in_use');
    });
  });

  describe('requirePlaceholderUpgradeUpdates', () => {
    it('throws FMS conflict message for email collisions', async () => {
      findByEmail.mockResolvedValue({ id: 'other' });
      await expect(
        requirePlaceholderUpgradeUpdates('u1', { email: 'a@b.com' }),
      ).rejects.toThrow(/email conflicts/i);
    });

    it('returns null for no contact', async () => {
      await expect(requirePlaceholderUpgradeUpdates('u1', {})).resolves.toBeNull();
    });
  });

  describe('queueInviteAfterPlaceholderUpgrade', () => {
    it('skips invite for placeholder users', () => {
      queueInviteAfterPlaceholderUpgrade({
        id: 'p1',
        is_placeholder: true,
        login_identifier: 'fms-ph:a:b',
      } as any);
      // No throw; FirstTimeUserService not loaded for placeholders
    });
  });
});
