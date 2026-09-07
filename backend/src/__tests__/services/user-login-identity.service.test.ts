import { UserLoginIdentityService } from '@/services/user-login-identity.service';
import { UserModel } from '@/models/user.model';
import { LOGIN_IDENTITY_CODES } from '@/services/user-login-identity.utils';

jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
    findAllByEmail: jest.fn(),
    findAllByPhone: jest.fn(),
    findAllByLoginIdentifiers: jest.fn(),
    updateById: jest.fn(),
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connection: {
        transaction: jest.fn(async (fn: (trx: any) => Promise<void>) => {
          const trx = Object.assign(jest.fn(() => trx), {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(1),
            fn: { now: jest.fn() },
          });
          await fn(trx);
        }),
      },
    }),
  },
}));

const findById = UserModel.findById as jest.Mock;
const findAllByEmail = UserModel.findAllByEmail as jest.Mock;
const findAllByPhone = UserModel.findAllByPhone as jest.Mock;
const findAllByLoginIdentifiers = UserModel.findAllByLoginIdentifiers as jest.Mock;

describe('UserLoginIdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findById.mockResolvedValue(undefined);
    findAllByEmail.mockResolvedValue([]);
    findAllByPhone.mockResolvedValue([]);
    findAllByLoginIdentifiers.mockResolvedValue([]);
  });

  it('plans a unique-email create against a shared phone', async () => {
    findAllByPhone.mockResolvedValue([
      {
        id: 'peer',
        email: 'peer@example.com',
        phone_number: '+12504882375',
        login_identifier: 'peer@example.com',
      },
    ]);

    const plan = await UserLoginIdentityService.planContactChange({
      email: 'new@example.com',
      phone: '+12504882375',
    });

    expect(plan).toMatchObject({ ok: true, loginIdentifier: 'new@example.com' });
  });

  it('returns NO_UNIQUE_LOGIN_HANDLE when both contacts are already shared', async () => {
    findAllByEmail.mockResolvedValue([
      {
        id: 'peer',
        email: 'same@example.com',
        phone_number: '+12504882375',
        login_identifier: 'same@example.com',
      },
    ]);
    findAllByPhone.mockResolvedValue([
      {
        id: 'peer',
        email: 'same@example.com',
        phone_number: '+12504882375',
        login_identifier: 'same@example.com',
      },
    ]);

    const plan = await UserLoginIdentityService.planContactChange({
      email: 'same@example.com',
      phone: '+12504882375',
    });

    expect(plan).toMatchObject({
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
    });
  });

  it('does not match a shared phone owner when the tenant also has an email', async () => {
    findAllByPhone.mockResolvedValue([
      {
        id: 'first-owner',
        email: 't3@example.com',
        phone_number: '+12504882375',
        login_identifier: 't3@example.com',
      },
    ]);

    const match = await UserLoginIdentityService.matchFmsTenant(
      { email: 't2@example.com', phone: '+12504882375' },
      undefined,
      [],
    );

    expect(match).toEqual({ kind: 'none' });
  });
});
