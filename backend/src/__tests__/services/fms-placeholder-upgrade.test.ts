/**
 * Tests for shared placeholder upgrade prepare/invite helpers.
 */
jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
    findAllByEmail: jest.fn(),
    findAllByPhone: jest.fn(),
    findAllByLoginIdentifiers: jest.fn(),
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
import { LOGIN_IDENTITY_CODES } from '@/services/user-login-identity.utils';

const findById = UserModel.findById as jest.Mock;
const findAllByEmail = UserModel.findAllByEmail as jest.Mock;
const findAllByPhone = UserModel.findAllByPhone as jest.Mock;
const findAllByLoginIdentifiers = UserModel.findAllByLoginIdentifiers as jest.Mock;

const placeholder = {
  id: 'u1',
  email: null,
  phone_number: null,
  login_identifier: 'fms-ph:a:b',
  is_placeholder: true,
};

describe('fms-placeholder-upgrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findById.mockResolvedValue(placeholder);
    findAllByEmail.mockResolvedValue([]);
    findAllByPhone.mockResolvedValue([]);
    findAllByLoginIdentifiers.mockResolvedValue([]);
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

    it('returns NO_UNIQUE_LOGIN_HANDLE when email is already an exclusive login', async () => {
      findAllByEmail.mockResolvedValue([
        { id: 'other', email: 'a@b.com', login_identifier: 'a@b.com', phone_number: null },
      ]);
      findAllByLoginIdentifiers.mockResolvedValue([
        { id: 'other', email: 'a@b.com', login_identifier: 'a@b.com', phone_number: null },
      ]);
      const result = await preparePlaceholderUpgrade('u1', { email: 'a@b.com' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE);
    });

    it('succeeds with unique email even when the phone is already stored on another user', async () => {
      findAllByPhone.mockResolvedValue([
        {
          id: 'other',
          email: 'peer@example.com',
          phone_number: '+15551234567',
          login_identifier: 'peer@example.com',
        },
      ]);
      const result = await preparePlaceholderUpgrade('u1', {
        email: 'a@b.com',
        phoneE164: '+15551234567',
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.updates.login_identifier).toBe('a@b.com');
    });
  });

  describe('requirePlaceholderUpgradeUpdates', () => {
    it('throws identity message for exclusive email collisions', async () => {
      findAllByEmail.mockResolvedValue([
        { id: 'other', email: 'a@b.com', login_identifier: 'a@b.com', phone_number: null },
      ]);
      findAllByLoginIdentifiers.mockResolvedValue([
        { id: 'other', email: 'a@b.com', login_identifier: 'a@b.com', phone_number: null },
      ]);
      await expect(
        requirePlaceholderUpgradeUpdates('u1', { email: 'a@b.com' }),
      ).rejects.toThrow(/already used by other BluLok users/i);
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
    });
  });
});
