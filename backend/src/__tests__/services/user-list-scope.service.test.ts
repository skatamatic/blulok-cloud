const mockDistinct = jest.fn();
const mockKnex = jest.fn(() => ({
  distinct: (...args: unknown[]) => mockDistinct(...args),
}));
(mockKnex as any).fn = { now: jest.fn(() => 'NOW()') };

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: mockKnex })),
  },
}));

jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
  },
}));

jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn(),
  },
}));

jest.mock('@/services/auth.service', () => ({
  AuthService: {
    canAccessAllFacilities: jest.fn((role: string) => role === 'admin' || role === 'dev_admin'),
  },
}));

jest.mock('@/utils/users-rbac.util', () => ({
  isUserVisibleToFacilityAdmin: jest.fn(),
}));

import { UserListScopeService } from '@/services/user-list-scope.service';
import { UserModel } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { isUserVisibleToFacilityAdmin } from '@/utils/users-rbac.util';
import { UserRole } from '@/types/auth.types';

describe('UserListScopeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDistinct.mockImplementation(() => {
      const chain: any = {
        where: jest.fn().mockReturnThis(),
        then: undefined,
      };
      chain.where.mockReturnValue(chain);
      // thenable for await
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve([{ shared_with_user_id: 'share-1' }]).then(resolve);
      return chain;
    });
  });

  it('getSharedAccessRecipientUserIds returns a set of recipient ids', async () => {
    const ids = await UserListScopeService.getSharedAccessRecipientUserIds('tenant-1');
    expect(ids.has('share-1')).toBe(true);
  });

  it('canRequesterViewUser allows self', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('u1', UserRole.TENANT, 'u1'),
    ).resolves.toBe(true);
  });

  it('canRequesterViewUser allows global admins', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('admin', UserRole.ADMIN, 'other'),
    ).resolves.toBe(true);
  });

  it('canRequesterViewUser denies FA with empty facility list', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('fa', UserRole.FACILITY_ADMIN, 'other', []),
    ).resolves.toBe(false);
  });

  it('canRequesterViewUser uses facility-admin visibility helper', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'other',
      role: UserRole.TENANT,
    });
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-1']);
    (isUserVisibleToFacilityAdmin as jest.Mock).mockReturnValue(true);

    await expect(
      UserListScopeService.canRequesterViewUser('fa', UserRole.FACILITY_ADMIN, 'other', ['fac-1']),
    ).resolves.toBe(true);
    expect(isUserVisibleToFacilityAdmin).toHaveBeenCalled();
  });

  it('canRequesterViewUser denies when target user missing for FA', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(undefined);
    await expect(
      UserListScopeService.canRequesterViewUser('fa', UserRole.FACILITY_ADMIN, 'missing', ['fac-1']),
    ).resolves.toBe(false);
  });

  it('canRequesterViewUser checks key-share recipients for tenants', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('tenant-1', UserRole.TENANT, 'share-1'),
    ).resolves.toBe(true);
    await expect(
      UserListScopeService.canRequesterViewUser('tenant-1', UserRole.TENANT, 'stranger'),
    ).resolves.toBe(false);
  });

  it('canRequesterViewUser returns false for unsupported roles', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('tech', UserRole.BLULOK_TECHNICIAN, 'other'),
    ).resolves.toBe(false);
  });
});
