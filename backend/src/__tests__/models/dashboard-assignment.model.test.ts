/** Real assignment model — setup-mocks stubs saved-dashboard.model globally. */
jest.mock('@/models/saved-dashboard.model', () =>
  jest.requireActual('@/models/saved-dashboard.model')
);

jest.mock('@/models/facility.model', () => ({
  FacilityModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
  })),
}));

import {
  DashboardAssignmentModel,
  SavedDashboardModel,
} from '@/models/saved-dashboard.model';
import { UserModel } from '@/models/user.model';
import { FacilityModel } from '@/models/facility.model';
import { UserRole } from '@/types/auth.types';
import { ASSIGNMENT_SCOPE_ENTITY_ZERO } from '@/utils/dashboard-assignment.utils';

function mockNoExistingAssignment(): void {
  const first = jest.fn().mockResolvedValue(undefined);
  const innerWhere = jest.fn().mockReturnValue({ first });
  const outerWhere = jest.fn().mockReturnValue({ where: innerWhere });
  jest.spyOn(DashboardAssignmentModel, 'query').mockReturnValue({
    where: outerWhere,
  } as never);
}

describe('DashboardAssignmentModel.createAssignment', () => {
  const createdBy = 'admin-1';
  const savedDashboardId = '11111111-1111-1111-1111-111111111111';
  const facilityId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(SavedDashboardModel, 'findById').mockResolvedValue({
      id: savedDashboardId,
      name: 'Test Template',
    } as never);
    mockNoExistingAssignment();
    jest.spyOn(DashboardAssignmentModel, 'create').mockResolvedValue({
      id: 'assignment-new',
      saved_dashboard_id: savedDashboardId,
      scope: 'global',
      facility_id: null,
      user_id: null,
      target_role: UserRole.FACILITY_ADMIN,
      priority: 0,
      created_by: createdBy,
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects when saved dashboard is missing', async () => {
    jest.spyOn(SavedDashboardModel, 'findById').mockResolvedValue(undefined);

    await expect(
      DashboardAssignmentModel.createAssignment(createdBy, {
        savedDashboardId,
        scope: 'global',
        targetRole: UserRole.FACILITY_ADMIN,
      })
    ).rejects.toThrow('Saved dashboard not found');
  });

  it('rejects when user is not found', async () => {
    jest.spyOn(UserModel, 'findById').mockResolvedValue(undefined);

    await expect(
      DashboardAssignmentModel.createAssignment(createdBy, {
        savedDashboardId,
        scope: 'user',
        userId,
        targetRole: UserRole.FACILITY_ADMIN,
      })
    ).rejects.toThrow('User not found');
  });

  it('rejects when user role does not match target role', async () => {
    jest.spyOn(UserModel, 'findById').mockResolvedValue({
      id: userId,
      role: UserRole.TENANT,
    } as never);

    await expect(
      DashboardAssignmentModel.createAssignment(createdBy, {
        savedDashboardId,
        scope: 'user',
        userId,
        targetRole: UserRole.FACILITY_ADMIN,
      })
    ).rejects.toThrow('does not match target role');
  });

  it('rejects when facility is not found', async () => {
    const facilityModel = { findById: jest.fn().mockResolvedValue(null) };
    (FacilityModel as jest.Mock).mockImplementation(() => facilityModel);

    await expect(
      DashboardAssignmentModel.createAssignment(createdBy, {
        savedDashboardId,
        scope: 'facility',
        facilityId,
        targetRole: UserRole.FACILITY_ADMIN,
      })
    ).rejects.toThrow('Facility not found');
  });

  it('rejects duplicate slot assignments', async () => {
    const first = jest.fn().mockResolvedValue({ id: 'existing' });
    const innerWhere = jest.fn().mockReturnValue({ first });
    const outerWhere = jest.fn().mockReturnValue({ where: innerWhere });
    jest.spyOn(DashboardAssignmentModel, 'query').mockReturnValue({
      where: outerWhere,
    } as never);

    await expect(
      DashboardAssignmentModel.createAssignment(createdBy, {
        savedDashboardId,
        scope: 'global',
        targetRole: UserRole.FACILITY_ADMIN,
      })
    ).rejects.toThrow('already exists');
  });

  it('creates a valid global assignment', async () => {
    const result = await DashboardAssignmentModel.createAssignment(createdBy, {
      savedDashboardId,
      scope: 'global',
      targetRole: UserRole.FACILITY_ADMIN,
      priority: 5,
    });

    expect(result.id).toBe('assignment-new');
    expect(DashboardAssignmentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope_entity_id: ASSIGNMENT_SCOPE_ENTITY_ZERO,
      })
    );
  });
});

describe('DashboardAssignmentModel.updateAssignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(DashboardAssignmentModel, 'db', {
      get: () => ({ fn: { now: () => new Date() } }),
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects unknown saved dashboard on update', async () => {
    jest.spyOn(SavedDashboardModel, 'findById').mockResolvedValue(undefined);
    const updateSpy = jest.fn().mockResolvedValue(1);
    jest.spyOn(DashboardAssignmentModel, 'query').mockReturnValue({
      where: jest.fn().mockReturnValue({ update: updateSpy }),
    } as never);

    await expect(
      DashboardAssignmentModel.updateAssignment('assignment-1', {
        savedDashboardId: 'missing-id',
      })
    ).rejects.toThrow('Saved dashboard not found');

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
