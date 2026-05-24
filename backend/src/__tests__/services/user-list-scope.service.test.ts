import { UserModel } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserListScopeService } from '@/services/user-list-scope.service';
import { UserRole } from '@/types/auth.types';

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

const mockFindById = UserModel.findById as jest.Mock;
const mockGetUserFacilityIds = UserFacilityAssociationModel.getUserFacilityIds as jest.Mock;

describe('UserListScopeService.canRequesterViewUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows self access', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('u1', UserRole.TENANT, 'u1', [])
    ).resolves.toBe(true);
  });

  it('allows global admin to view any user', async () => {
    await expect(
      UserListScopeService.canRequesterViewUser('admin', UserRole.ADMIN, 'anyone', [])
    ).resolves.toBe(true);
  });

  it('denies facility admin access to global admin target', async () => {
    mockFindById.mockResolvedValue({ id: 'global', role: UserRole.ADMIN });
    mockGetUserFacilityIds.mockResolvedValue([]);

    await expect(
      UserListScopeService.canRequesterViewUser(
        'fa',
        UserRole.FACILITY_ADMIN,
        'global',
        ['fac-a']
      )
    ).resolves.toBe(false);
  });

  it('allows facility admin to view tenant in shared facility', async () => {
    mockFindById.mockResolvedValue({ id: 'tenant', role: UserRole.TENANT });
    mockGetUserFacilityIds.mockResolvedValue(['fac-a']);

    await expect(
      UserListScopeService.canRequesterViewUser(
        'fa',
        UserRole.FACILITY_ADMIN,
        'tenant',
        ['fac-a']
      )
    ).resolves.toBe(true);
  });
});
