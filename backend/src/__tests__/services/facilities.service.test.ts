/**
 * Unit tests for FacilitiesService — delete impact counts and cascade delete behavior.
 * Uses controlled knex mocks via mockDatabaseService (no real DB, no transactions in test env).
 */
import { mockDatabaseService } from '@/__tests__/mocks/database.mock';
import { FacilitiesService } from '@/services/facilities.service';

describe('FacilitiesService', () => {
  beforeEach(() => {
    (FacilitiesService as unknown as { instance?: FacilitiesService }).instance = undefined;
    jest.clearAllMocks();
  });

  describe('getDeleteImpact', () => {
    it('returns unit, device, and gateway counts from aggregate queries', async () => {
      const knex = jest.fn((table: string) => {
        const chain: Record<string, unknown> = {
          where: jest.fn().mockReturnThis(),
          join: jest.fn().mockReturnThis(),
          count: jest.fn().mockReturnThis(),
        };
        const countByTable: Record<string, string> = {
          units: '4',
          blulok_devices: '11',
          gateways: '2',
        };
        (chain as { first: jest.Mock }).first = jest
          .fn()
          .mockResolvedValue({ count: countByTable[table] ?? '0' });
        return chain;
      });

      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = FacilitiesService.getInstance();
      const impact = await svc.getDeleteImpact('fac-1');

      expect(impact).toEqual({ units: 4, devices: 11, gateways: 2 });
      expect(knex).toHaveBeenCalledWith('units');
      expect(knex).toHaveBeenCalledWith('blulok_devices');
      expect(knex).toHaveBeenCalledWith('gateways');
    });

    it('coerces missing count to zero', async () => {
      const knex = jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      }));

      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      (FacilitiesService as unknown as { instance?: FacilitiesService }).instance = undefined;
      const svc = FacilitiesService.getInstance();
      const impact = await svc.getDeleteImpact('fac-empty');

      expect(impact).toEqual({ units: 0, devices: 0, gateways: 0 });
    });
  });

  describe('deleteFacilityCascade', () => {
    it('throws when facility row was not deleted', async () => {
      const delResults: Record<string, number> = {
        device_denylist_entries: 0,
        blulok_devices: 0,
        key_sharing: 0,
        unit_assignments: 0,
        units: 0,
        access_control_devices: 0,
        gateways: 0,
        facilities: 0,
      };

      const knex = jest.fn((table: string) => {
        const chain: Record<string, unknown> = {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          select: jest.fn(),
          del: jest.fn(),
        };

        (chain.select as jest.Mock).mockImplementation(async () => {
          if (table === 'units') return [];
          if (table === 'blulok_devices') return [];
          if (table === 'gateways') return [];
          return [];
        });

        (chain.del as jest.Mock).mockImplementation(async () => {
          const n = delResults[table] ?? 0;
          return n;
        });

        return chain;
      });

      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      (FacilitiesService as unknown as { instance?: FacilitiesService }).instance = undefined;
      const svc = FacilitiesService.getInstance();

      await expect(svc.deleteFacilityCascade('missing-facility', 'admin-1')).rejects.toThrow('Facility not found');
    });

    it('deletes related rows then facility when data exists', async () => {
      const unitIds = ['u1'];
      const deviceIds = ['d1'];
      const gatewayIds = ['g1'];

      const knex = jest.fn((table: string) => {
        const chain: Record<string, unknown> = {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          select: jest.fn(),
          del: jest.fn(),
        };

        (chain.select as jest.Mock).mockImplementation(async () => {
          if (table === 'units') return unitIds.map((id) => ({ id }));
          if (table === 'blulok_devices') return deviceIds.map((id) => ({ id }));
          if (table === 'gateways') return gatewayIds.map((id) => ({ id }));
          return [];
        });

        (chain.del as jest.Mock).mockResolvedValue(1);

        return chain;
      });

      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      expect(process.env.NODE_ENV).toBe('test');

      (FacilitiesService as unknown as { instance?: FacilitiesService }).instance = undefined;
      const svc = FacilitiesService.getInstance();

      await expect(svc.deleteFacilityCascade('fac-1', 'admin-1')).resolves.toBeUndefined();

      expect(knex).toHaveBeenCalledWith('device_denylist_entries');
      expect(knex).toHaveBeenCalledWith('blulok_devices');
      expect(knex).toHaveBeenCalledWith('key_sharing');
      expect(knex).toHaveBeenCalledWith('unit_assignments');
      expect(knex).toHaveBeenCalledWith('units');
      expect(knex).toHaveBeenCalledWith('access_control_devices');
      expect(knex).toHaveBeenCalledWith('gateways');
      expect(knex).toHaveBeenCalledWith('facilities');
    });
  });
});
