import { Response } from 'express';
import { UnitsService } from '@/services/units.service';
import { AuthenticatedRequest } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import { normalizeUnitsListQuery } from '@/utils/units-query.utils';
import { logger } from '@/utils/logger';

export type HandleGetUnitsListOptions = {
  forcedFacilityId?: string;
  extraFilters?: Record<string, unknown>;
  errorMessage?: string;
};

function resolveHandleGetUnitsListOptions(
  options?: HandleGetUnitsListOptions | string,
): HandleGetUnitsListOptions {
  if (typeof options === 'string') {
    return { forcedFacilityId: options };
  }
  return options ?? {};
}

export async function handleGetUnitsList(
  req: AuthenticatedRequest,
  res: Response,
  options?: HandleGetUnitsListOptions | string,
): Promise<void> {
  const { forcedFacilityId, extraFilters, errorMessage = 'Failed to fetch units' } =
    resolveHandleGetUnitsListOptions(options);

  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const filters = {
    ...normalizeUnitsListQuery(req.query as Record<string, unknown>, forcedFacilityId),
    ...extraFilters,
  };
  const facilityId = typeof filters.facility_id === 'string' ? filters.facility_id : undefined;

  if (facilityId && AuthService.isFacilityScoped(userRole)) {
    const hasAccess = await AuthService.canAccessFacility(userId, userRole, facilityId);
    if (!hasAccess) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
  }

  try {
    const unitsService = UnitsService.getInstance();
    const result = await unitsService.getUnits(userId, userRole, filters);

    res.json({
      success: true,
      units: result.units || [],
      total: result.total ?? 0,
    });
  } catch (error) {
    logger.error(errorMessage, error);
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
}
