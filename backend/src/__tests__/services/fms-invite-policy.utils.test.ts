import { FMSInvitePolicy } from '@/types/fms.types';
import {
  evaluateFmsInvite,
  resolveFmsInvitePolicy,
} from '@/services/fms/fms-invite-policy.utils';

const mockFirst = jest.fn();

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connection: jest.fn(() => ({
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: mockFirst,
      })),
    }),
  },
}));

jest.mock('@/services/fms/fms-placeholder-user.utils', () => ({
  isPlaceholderUser: jest.fn((u: { is_placeholder?: boolean }) => Boolean(u.is_placeholder)),
}));

describe('resolveFmsInvitePolicy', () => {
  it('defaults to NONE when unset', () => {
    expect(resolveFmsInvitePolicy(undefined)).toBe(FMSInvitePolicy.NONE);
    expect(resolveFmsInvitePolicy(null)).toBe(FMSInvitePolicy.NONE);
    expect(resolveFmsInvitePolicy({ autoAcceptChanges: false })).toBe(FMSInvitePolicy.NONE);
  });

  it('resolves ALL and DEVICE_EQUIPPED', () => {
    expect(
      resolveFmsInvitePolicy({ autoAcceptChanges: false, invitePolicy: FMSInvitePolicy.ALL }),
    ).toBe(FMSInvitePolicy.ALL);
    expect(
      resolveFmsInvitePolicy({
        autoAcceptChanges: false,
        invitePolicy: FMSInvitePolicy.DEVICE_EQUIPPED,
      }),
    ).toBe(FMSInvitePolicy.DEVICE_EQUIPPED);
  });

  it('treats unknown values as NONE', () => {
    expect(
      resolveFmsInvitePolicy({
        autoAcceptChanges: false,
        invitePolicy: 'bogus' as FMSInvitePolicy,
      }),
    ).toBe(FMSInvitePolicy.NONE);
  });
});

describe('evaluateFmsInvite', () => {
  const baseUser = {
    id: 'u1',
    email: 'a@b.com',
    phone_number: null as string | null,
    is_placeholder: false,
    login_identifier: 'a@b.com',
  };

  beforeEach(() => {
    mockFirst.mockReset();
  });

  it('skips placeholders and users without contact', async () => {
    expect(
      await evaluateFmsInvite(
        { ...baseUser, is_placeholder: true },
        'fac-1',
        { autoAcceptChanges: false, invitePolicy: FMSInvitePolicy.ALL },
      ),
    ).toBe('skip_placeholder');

    expect(
      await evaluateFmsInvite(
        { ...baseUser, email: null, phone_number: null },
        'fac-1',
        { autoAcceptChanges: false, invitePolicy: FMSInvitePolicy.ALL },
      ),
    ).toBe('skip_no_contact');
  });

  it('defers when policy is NONE and sends when ALL', async () => {
    expect(
      await evaluateFmsInvite(baseUser, 'fac-1', {
        autoAcceptChanges: false,
        invitePolicy: FMSInvitePolicy.NONE,
      }),
    ).toBe('defer_policy');

    expect(
      await evaluateFmsInvite(baseUser, 'fac-1', {
        autoAcceptChanges: false,
        invitePolicy: FMSInvitePolicy.ALL,
      }),
    ).toBe('send');
  });

  it('defers or sends based on BluLok device eligibility', async () => {
    mockFirst.mockResolvedValueOnce(undefined);
    expect(
      await evaluateFmsInvite(baseUser, 'fac-1', {
        autoAcceptChanges: false,
        invitePolicy: FMSInvitePolicy.DEVICE_EQUIPPED,
      }),
    ).toBe('defer_awaiting_device');

    mockFirst.mockResolvedValueOnce({ id: 'bd-1' });
    expect(
      await evaluateFmsInvite(baseUser, 'fac-1', {
        autoAcceptChanges: false,
        invitePolicy: FMSInvitePolicy.DEVICE_EQUIPPED,
      }),
    ).toBe('send');
  });
});
