import { UserRole } from '@/types/auth.types';
import {
  assertAppFacilityAccess,
  canReceiveActivityOnAppStream,
  canReceiveDeviceOnAppStream,
  canReceiveUnitsUpdateOnAppStream,
  clientCanAccessFacility,
} from '@/services/app-realtime.scope';
import { FacilityAccessService } from '@/services/facility-access.service';
import type { AppRealtimeClient } from '@/services/app-realtime.types';

jest.mock('@/services/facility-access.service', () => ({
  FacilityAccessService: {
    hasAccessToFacility: jest.fn(),
    getUserFacilityIds: jest.fn(),
  },
}));

function makeClient(overrides: Partial<AppRealtimeClient> = {}): AppRealtimeClient {
  return {
    userId: 'user-1',
    userRole: UserRole.TENANT,
    facilityIds: ['facility-1'],
    facilityId: 'facility-1',
    accessibleUnitIds: new Set(['unit-a']),
    lastClientHeartbeat: new Date(),
    heartbeatCount: 0,
    ...overrides,
  };
}

describe('app-realtime.scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assertAppFacilityAccess', () => {
    it('rejects missing facility_id', async () => {
      const result = await assertAppFacilityAccess('u1', UserRole.TENANT, '');
      expect(result).toEqual({ ok: false, error: 'facility_id is required' });
    });

    it('rejects when FacilityAccessService denies', async () => {
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(false);
      const result = await assertAppFacilityAccess('u1', UserRole.TENANT, 'facility-x');
      expect(result).toEqual({ ok: false, error: 'Access denied to facility' });
    });

    it('accepts when access is granted', async () => {
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const result = await assertAppFacilityAccess('u1', UserRole.TENANT, 'facility-1');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('clientCanAccessFacility', () => {
    it('allows global admins for any facility', () => {
      const client = makeClient({ userRole: UserRole.ADMIN, facilityIds: undefined });
      expect(clientCanAccessFacility(client, 'any-facility')).toBe(true);
    });

    it('checks facilityIds for tenants', () => {
      const client = makeClient({ userRole: UserRole.TENANT, facilityIds: ['facility-1'] });
      expect(clientCanAccessFacility(client, 'facility-1')).toBe(true);
      expect(clientCanAccessFacility(client, 'facility-2')).toBe(false);
    });
  });

  describe('canReceiveDeviceOnAppStream', () => {
    it('filters tenant devices to accessible units only', () => {
      const client = makeClient();
      expect(
        canReceiveDeviceOnAppStream(client, { facility_id: 'facility-1', unit_id: 'unit-a' }),
      ).toBe(true);
      expect(
        canReceiveDeviceOnAppStream(client, { facility_id: 'facility-1', unit_id: 'unit-b' }),
      ).toBe(false);
      expect(
        canReceiveDeviceOnAppStream(client, { facility_id: 'facility-1', unit_id: null }),
      ).toBe(false);
    });

    it('allows facility admins all devices in subscribed facility', () => {
      const client = makeClient({
        userRole: UserRole.FACILITY_ADMIN,
        accessibleUnitIds: undefined,
      });
      expect(
        canReceiveDeviceOnAppStream(client, { facility_id: 'facility-1', unit_id: null }),
      ).toBe(true);
      expect(
        canReceiveDeviceOnAppStream(client, { facility_id: 'facility-2', unit_id: 'unit-a' }),
      ).toBe(false);
    });
  });

  describe('canReceiveActivityOnAppStream', () => {
    it('allows tenant own-actor or accessible unit activity', () => {
      const client = makeClient();
      expect(
        canReceiveActivityOnAppStream(client, {
          facilityId: 'facility-1',
          unitId: 'unit-a',
          actor: { id: 'other' },
        }),
      ).toBe(true);
      expect(
        canReceiveActivityOnAppStream(client, {
          facilityId: 'facility-1',
          unitId: null,
          actor: { id: 'user-1' },
        }),
      ).toBe(true);
      expect(
        canReceiveActivityOnAppStream(client, {
          facilityId: 'facility-1',
          unitId: 'unit-b',
          actor: { id: 'other' },
        }),
      ).toBe(false);
    });

    it('restricts maintenance to own actor', () => {
      const client = makeClient({ userRole: UserRole.MAINTENANCE });
      expect(
        canReceiveActivityOnAppStream(client, {
          facilityId: 'facility-1',
          unitId: 'unit-a',
          actor: { id: 'user-1' },
        }),
      ).toBe(true);
      expect(
        canReceiveActivityOnAppStream(client, {
          facilityId: 'facility-1',
          unitId: 'unit-a',
          actor: { id: 'other' },
        }),
      ).toBe(false);
    });
  });

  describe('canReceiveUnitsUpdateOnAppStream', () => {
    it('sends tenants units_update only for accessible units', () => {
      const client = makeClient();
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-1', unitId: 'unit-a' }),
      ).toBe(true);
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-1', unitId: 'unit-b' }),
      ).toBe(false);
    });

    it('does not notify tenants for facility-wide or unit-less device changes', () => {
      const client = makeClient();
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-1' }),
      ).toBe(false);
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-1', unitId: null }),
      ).toBe(false);
    });

    it('allows facility admins facility-scoped units updates including facility-wide', () => {
      const client = makeClient({
        userRole: UserRole.FACILITY_ADMIN,
        accessibleUnitIds: undefined,
      });
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-1' }),
      ).toBe(true);
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-1', unitId: 'unit-b' }),
      ).toBe(true);
      expect(
        canReceiveUnitsUpdateOnAppStream(client, { facilityId: 'facility-2' }),
      ).toBe(false);
    });
  });
});
