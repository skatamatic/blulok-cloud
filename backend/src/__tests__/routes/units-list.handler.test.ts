import { Response } from 'express';
import { handleGetUnitsList } from '@/routes/units-list.handler';
import { UnitsService } from '@/services/units.service';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { AuthenticatedRequest } from '@/types/auth.types';
import { logger } from '@/utils/logger';

jest.mock('@/services/units.service');
jest.mock('@/services/auth.service');
jest.mock('@/utils/logger');

describe('units-list.handler', () => {
  const getUnits = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (UnitsService.getInstance as jest.Mock).mockReturnValue({ getUnits });
    (AuthService.isFacilityScoped as jest.Mock).mockReturnValue(false);
  });

  function buildResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  }

  function buildRequest(partial: {
    user: { userId: string; role: UserRole };
    query?: Record<string, string>;
  }): AuthenticatedRequest {
    return {
      user: partial.user,
      query: partial.query ?? {},
    } as unknown as AuthenticatedRequest;
  }

  it('logs and returns 500 when the service throws', async () => {
    getUnits.mockRejectedValue(new Error('db down'));
    const req = buildRequest({ user: { userId: 'admin-1', role: UserRole.ADMIN } });
    const res = buildResponse();

    await handleGetUnitsList(req, res, { errorMessage: 'Failed to fetch units' });

    expect(logger.error).toHaveBeenCalledWith('Failed to fetch units', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Failed to fetch units' });
  });

  it('merges extra filters such as lock_status', async () => {
    getUnits.mockResolvedValue({ units: [], total: 0 });
    const req = buildRequest({
      user: { userId: 'admin-1', role: UserRole.ADMIN },
      query: { limit: '10' },
    });
    const res = buildResponse();

    await handleGetUnitsList(req, res, {
      extraFilters: { lock_status: 'unlocked' },
      errorMessage: 'Failed to fetch unlocked units',
    });

    expect(getUnits).toHaveBeenCalledWith('admin-1', UserRole.ADMIN, expect.objectContaining({
      lock_status: 'unlocked',
      limit: '10',
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, units: [], total: 0 });
  });

  it('forces path facility id over query params', async () => {
    getUnits.mockResolvedValue({ units: [], total: 0 });
    const req = buildRequest({
      user: { userId: 'admin-1', role: UserRole.ADMIN },
      query: { facilityId: 'fac-from-query', limit: '25' },
    });
    const res = buildResponse();

    await handleGetUnitsList(req, res, 'fac-from-path');

    expect(getUnits).toHaveBeenCalledWith('admin-1', UserRole.ADMIN, expect.objectContaining({
      facility_id: 'fac-from-path',
      limit: '25',
    }));
  });

  it('returns 403 when a facility-scoped user lacks facility access', async () => {
    (AuthService.isFacilityScoped as jest.Mock).mockReturnValue(true);
    (AuthService.canAccessFacility as jest.Mock).mockResolvedValue(false);
    const req = buildRequest({
      user: { userId: 'fac-admin-1', role: UserRole.FACILITY_ADMIN },
      query: { limit: '25' },
    });
    const res = buildResponse();

    await handleGetUnitsList(req, res, 'foreign-facility');

    expect(getUnits).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Access denied to this facility',
    });
  });
});
