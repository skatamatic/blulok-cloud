import { RoutePassOrchestrator } from '@/services/passes/route-pass.orchestrator';
import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { DatabaseService } from '@/services/database.service';
import { PassesService } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/database.service');
jest.mock('@/services/crypto/ed25519.service');
jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn(),
  },
}));
jest.mock('@/models/user-facility-schedule.model', () => ({
  UserFacilityScheduleModel: {
    getUserScheduleForFacilityWithDetails: jest.fn(),
  },
}));
jest.mock('@/models/route-pass-issuance.model', () => ({
  RoutePassIssuanceModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({}),
  })),
}));
jest.mock('@/services/passes/app-entry-access.service', () => ({
  AppEntryAccessService: {
    resolveDeviceIds: jest.fn().mockResolvedValue([]),
  },
}));

const { UserFacilityAssociationModel } = require('@/models/user-facility-association.model');
const { UserFacilityScheduleModel } = require('@/models/user-facility-schedule.model');

function makeThenableBuilder(rows: any[]) {
  const b: any = {
    join: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn(),
  };
  b.then = (resolve: any) => resolve(rows);
  return b;
}

describe('RoutePassOrchestrator', () => {
  let issueRoutePassSpy: jest.SpyInstance;
  let audienceResolveSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    issueRoutePassSpy = jest.spyOn(PassesService, 'issueRoutePass').mockResolvedValue('jwt-token' as never);
    audienceResolveSpy = jest.spyOn(AudienceResolver, 'resolve');
  });

  afterEach(() => {
    issueRoutePassSpy.mockRestore();
    audienceResolveSpy.mockRestore();
  });

  it('issues a route pass using preferred device header', async () => {
    audienceResolveSpy.mockResolvedValue(['lock:serial-1']);
    const lockRows = [{ device_serial: 'serial-1', facility_id: 'fac-x' }];
    const db: any = jest.fn((table: string) => {
      if (table === 'user_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'device-1', public_key: 'pubkey' }),
        };
      }
      if (String(table).startsWith('blulok_devices')) {
        return makeThenableBuilder(lockRows);
      }
      if (String(table).includes('access_control_devices')) {
        return makeThenableBuilder([]);
      }
      return makeThenableBuilder([]);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({ jti: 'j', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });

    const token = await RoutePassOrchestrator.issueForUser(
      { userId: 'u1', role: UserRole.ADMIN, facilityIds: [] },
      'phone-1',
    );
    expect(token).toBe('jwt-token');
    expect(PassesService.issueRoutePass).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        devicePublicKey: 'pubkey',
        audiences: ['lock:serial-1'],
        userRole: UserRole.ADMIN,
      }),
    );
    const arg = issueRoutePassSpy.mock.calls[0][0];
    expect(arg.schedules).toBeUndefined();
    expect(UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails).not.toHaveBeenCalled();
  });

  it('embeds compact schedules for tenant with facility-scoped locks', async () => {
    audienceResolveSpy.mockResolvedValue(['lock:serial-1']);
    const lockRows = [{ device_serial: 'serial-1', facility_id: 'fac-1' }];
    const db: any = jest.fn((table: string) => {
      if (table === 'user_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'device-1', public_key: 'pubkey' }),
        };
      }
      if (String(table).startsWith('blulok_devices')) {
        return makeThenableBuilder(lockRows);
      }
      if (String(table).includes('access_control_devices')) {
        return makeThenableBuilder([]);
      }
      return makeThenableBuilder([]);
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({
      jti: 'j',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-1']);
    (UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails as jest.Mock).mockResolvedValue({
      schedule: {
        time_windows: [
          { day_of_week: 2, start_time: '13:00:00', end_time: '15:00:00' },
          { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
        ],
      },
    });

    await RoutePassOrchestrator.issueForUser(
      { userId: 'u1', role: UserRole.TENANT, facilityIds: [] },
      'phone-1',
    );

    expect(PassesService.issueRoutePass).toHaveBeenCalledWith(
      expect.objectContaining({
        userRole: UserRole.TENANT,
        schedules: [
          {
            f: 'fac-1',
            w: [
              [[[1, 1]], '09:00', '12:00'],
              [[[2, 2]], '13:00', '15:00'],
            ],
          },
        ],
      }),
    );
  });

  it('omits schedules for admin even when facility is scoped', async () => {
    audienceResolveSpy.mockResolvedValue(['lock:serial-1']);
    const lockRows = [{ device_serial: 'serial-1', facility_id: 'fac-2' }];
    const db: any = jest.fn((table: string) => {
      if (table === 'user_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'device-1', public_key: 'pubkey' }),
        };
      }
      if (table === 'facilities') {
        return {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'fac-2' }),
        };
      }
      if (String(table).startsWith('blulok_devices')) {
        return makeThenableBuilder(lockRows);
      }
      if (String(table).includes('access_control_devices')) {
        return makeThenableBuilder([]);
      }
      return makeThenableBuilder([]);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({
      jti: 'j',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await RoutePassOrchestrator.issueForUser(
      { userId: 'u1', role: UserRole.ADMIN, facilityId: 'fac-2', facilityIds: [] },
      'phone-1',
    );

    expect(UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails).not.toHaveBeenCalled();
    const arg = issueRoutePassSpy.mock.calls[0][0];
    expect(arg.schedules).toBeUndefined();
  });

  it('omits schedules for dev_admin', async () => {
    audienceResolveSpy.mockResolvedValue(['lock:s1']);
    const lockRows = [{ device_serial: 's1', facility_id: 'f1' }];
    const db: any = jest.fn((table: string) => {
      if (table === 'user_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'd1', public_key: 'pk' }),
        };
      }
      if (String(table).startsWith('blulok_devices')) {
        return makeThenableBuilder(lockRows);
      }
      if (String(table).includes('access_control_devices')) {
        return makeThenableBuilder([]);
      }
      return makeThenableBuilder([]);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({ jti: 'j', iat: 1, exp: 2 });

    await RoutePassOrchestrator.issueForUser({ userId: 'u1', role: UserRole.DEV_ADMIN, facilityIds: [] }, 'p1');
    expect(issueRoutePassSpy.mock.calls[0][0].schedules).toBeUndefined();
  });

  it('embeds schedules for multiple facilities from audiences', async () => {
    audienceResolveSpy.mockResolvedValue(['lock:a', 'lock:b']);
    const lockRows = [
      { device_serial: 'a', facility_id: 'fac-a' },
      { device_serial: 'b', facility_id: 'fac-b' },
    ];
    const db: any = jest.fn((table: string) => {
      if (table === 'user_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'device-1', public_key: 'pubkey' }),
        };
      }
      if (String(table).startsWith('blulok_devices')) {
        return makeThenableBuilder(lockRows);
      }
      if (String(table).includes('access_control_devices')) {
        return makeThenableBuilder([]);
      }
      return makeThenableBuilder([]);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({ jti: 'j', iat: 1, exp: 2 });
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-a', 'fac-b']);
    (UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails as jest.Mock).mockImplementation(
      async (_uid: string, fid: string) => {
        if (fid === 'fac-a') {
          return { schedule: { time_windows: [{ day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' }] } };
        }
        if (fid === 'fac-b') {
          return { schedule: { time_windows: [{ day_of_week: 2, start_time: '10:00:00', end_time: '11:00:00' }] } };
        }
        return undefined;
      },
    );

    await RoutePassOrchestrator.issueForUser({ userId: 'u1', role: UserRole.TENANT, facilityIds: [] }, 'phone-1');

    expect(PassesService.issueRoutePass).toHaveBeenCalledWith(
      expect.objectContaining({
        schedules: [
          { f: 'fac-a', w: [[[[1, 1]], '08:00', '09:00']] },
          { f: 'fac-b', w: [[[[2, 2]], '10:00', '11:00']] },
        ],
      }),
    );
  });
});
