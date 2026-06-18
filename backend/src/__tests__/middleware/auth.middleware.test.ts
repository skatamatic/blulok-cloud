import { authenticateToken, applyFacilityScope } from '@/middleware/auth.middleware';
import { AuthService } from '@/services/auth.service';
import { FacilityAccessService } from '@/services/facility-access.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import type { Response } from 'express';

describe('authenticateToken facility hydration', () => {
  const res = {} as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replaces JWT facilityIds with live DB associations for facility admins', async () => {
    const token = AuthService.generateToken(
      {
        id: 'facility-admin-1',
        email: 'fa@test.com',
        first_name: 'FA',
        last_name: 'User',
        role: UserRole.FACILITY_ADMIN,
        password_hash: 'x',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any,
      ['stale-jwt-only']
    );

    const getIdsMock = UserFacilityAssociationModel.getUserFacilityIds as jest.Mock;
    getIdsMock.mockResolvedValueOnce([
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
    ]);

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let middlewareError: unknown;
    await new Promise<void>((resolve) => {
      authenticateToken(req, res, (err) => {
        middlewareError = err;
        resolve();
      });
    });

    expect(middlewareError).toBeUndefined();
    expect(req.user?.facilityIds).toEqual([
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
    ]);
    expect(req.user?.facilityIds).not.toContain('stale-jwt-only');
  });

  it('drops facilities removed from DB even when JWT still lists them', async () => {
    const facilityOne = '550e8400-e29b-41d4-a716-446655440001';
    const facilityTwo = '550e8400-e29b-41d4-a716-446655440002';
    const token = AuthService.generateToken(
      {
        id: 'facility-admin-1',
        email: 'fa@test.com',
        first_name: 'FA',
        last_name: 'User',
        role: UserRole.FACILITY_ADMIN,
        password_hash: 'x',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any,
      [facilityOne, facilityTwo]
    );

    const getIdsMock = UserFacilityAssociationModel.getUserFacilityIds as jest.Mock;
    getIdsMock.mockResolvedValueOnce([facilityOne]);

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let middlewareError: unknown;
    await new Promise<void>((resolve) => {
      authenticateToken(req, res, (err) => {
        middlewareError = err;
        resolve();
      });
    });

    expect(middlewareError).toBeUndefined();
    expect(req.user?.facilityIds).toEqual([facilityOne]);
    expect(req.user?.facilityIds).not.toContain(facilityTwo);
  });

  it('hydrates tenant facilityIds from unit assignments, not JWT claims', async () => {
    const liveFacilities = ['550e8400-e29b-41d4-a716-446655440001'];
    const token = AuthService.generateToken(
      {
        id: 'tenant-1',
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: UserRole.TENANT,
        password_hash: 'x',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any,
      ['stale-jwt-only']
    );

    jest.spyOn(FacilityAccessService, 'getUserFacilityIds').mockResolvedValueOnce(liveFacilities);

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let middlewareError: unknown;
    await new Promise<void>((resolve) => {
      authenticateToken(req, res, (err) => {
        middlewareError = err;
        resolve();
      });
    });

    expect(middlewareError).toBeUndefined();
    expect(req.user?.facilityIds).toEqual(liveFacilities);
    expect(req.user?.facilityIds).not.toContain('stale-jwt-only');
  });

  it('applyFacilityScope returns hydrated facilityIds for scoped users', async () => {
    const req = {
      user: {
        userId: 'facility-admin-1',
        role: UserRole.FACILITY_ADMIN,
        facilityIds: ['550e8400-e29b-41d4-a716-446655440001', 'facility-1'],
      },
    } as AuthenticatedRequest;

    expect(applyFacilityScope(req)).toEqual([
      '550e8400-e29b-41d4-a716-446655440001',
      'facility-1',
    ]);
  });

  it('applyFacilityScope returns undefined for global admins', () => {
    const req = {
      user: {
        userId: 'admin-1',
        role: UserRole.ADMIN,
        facilityIds: [],
      },
    } as AuthenticatedRequest;

    expect(applyFacilityScope(req)).toBeUndefined();
  });
});
