import { RoutePassOrchestrator } from '@/services/passes/route-pass.orchestrator';
import { DatabaseService } from '@/services/database.service';
import { PassesService } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/database.service');
jest.mock('@/services/passes.service');
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

describe('RoutePassOrchestrator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('issues a route pass using preferred device header', async () => {
    const db: any = jest.fn((table: string) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        fn: { now: () => new Date() },
      };
      if (table === 'user_devices') {
        qb.first.mockResolvedValue({ id: 'device-1', public_key: 'pubkey' });
      } else if (table.startsWith('blulok_devices')) {
        qb.select.mockResolvedValue([{ device_serial: 'serial-1' }]);
      }
      return qb;
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (PassesService.issueRoutePass as jest.Mock).mockResolvedValue('jwt-token');
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({ jti: 'j', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });

    const token = await RoutePassOrchestrator.issueForUser(
      { userId: 'u1', role: UserRole.ADMIN, facilityIds: [] },
      'phone-1'
    );
    expect(token).toBe('jwt-token');
    expect(PassesService.issueRoutePass).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      devicePublicKey: 'pubkey',
      audiences: ['lock:serial-1'],
    }));
  });

  it('serializes schedule using shared transport format', async () => {
    const db: any = jest.fn((table: string) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        fn: { now: () => new Date() },
      };
      if (table === 'user_devices') {
        qb.first.mockResolvedValue({ id: 'device-1', public_key: 'pubkey' });
      } else if (table.startsWith('blulok_devices')) {
        qb.select.mockResolvedValue([{ device_serial: 'serial-1' }]);
      }
      return qb;
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (PassesService.issueRoutePass as jest.Mock).mockResolvedValue('jwt-token');
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

    expect(PassesService.issueRoutePass).toHaveBeenCalledWith(expect.objectContaining({
      schedule: {
        facility_id: 'fac-1',
        time_windows: [
          { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
          { day_of_week: 2, start_time: '13:00:00', end_time: '15:00:00' },
        ],
      },
    }));
  });

  it('uses requested facility scope for schedule resolution', async () => {
    const db: any = jest.fn((table: string) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        fn: { now: () => new Date() },
      };
      if (table === 'user_devices') {
        qb.first.mockResolvedValue({ id: 'device-1', public_key: 'pubkey' });
      } else if (table.startsWith('blulok_devices')) {
        qb.select.mockResolvedValue([{ device_serial: 'serial-1' }]);
      } else if (table === 'facilities') {
        qb.first.mockResolvedValue({ id: 'fac-2' });
      }
      return qb;
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (PassesService.issueRoutePass as jest.Mock).mockResolvedValue('jwt-token');
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({
      jti: 'j',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    (UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails as jest.Mock).mockResolvedValue({
      schedule: {
        time_windows: [{ day_of_week: 1, start_time: '08:00:00', end_time: '20:00:00' }],
      },
    });

    await RoutePassOrchestrator.issueForUser(
      { userId: 'u1', role: UserRole.ADMIN, facilityId: 'fac-2', facilityIds: [] },
      'phone-1',
    );

    expect(UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails).toHaveBeenCalledWith('u1', 'fac-2');
  });
});

