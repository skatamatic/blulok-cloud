import { Router, Response } from 'express';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { asyncHandler, AccessDeniedError } from '@/middleware/error.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { AccessCodeService } from '@/services/access-code.service';
import { AuthService } from '@/services/auth.service';
import {
  registerGet,
  registerPut,
  registerPost,
} from '@/openapi/register-route';
import {
  accessCodeConfigSchema,
  accessCodeRotateSchema,
  accessCodeSetManualSchema,
  accessCodeGroupConfigSchema,
  accessCodeFacilityIdParamSchema,
  accessCodeGroupIdParamSchema,
  accessCodeIdParamSchema,
  accessCodeFacilityQuerySchema,
  accessCodeMyQuerySchema,
  accessCodeResponseSchema,
} from '@/schemas/access-codes.schemas';

const router = Router();
const MOUNT = '/api/v1/access-codes';
const getService = (): AccessCodeService => AccessCodeService.getInstance();

const manageRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN];
const appReadRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN, UserRole.TENANT, UserRole.MAINTENANCE];

const assertFacilityAccess = (req: AuthenticatedRequest, facilityId: string): void => {
  const user = req.user!;
  if (AuthService.canAccessAllFacilities(user.role)) return;
  if (!user.facilityIds?.includes(facilityId)) {
    throw new AccessDeniedError('Access denied to this facility');
  }
};

router.use(authenticateToken);

registerGet(
  router,
  '/my',
  {
    openApiPath: `${MOUNT}/my`,
    tags: ['AccessCodes'],
    summary: 'Get access codes for current user',
    security: 'bearer',
    query: accessCodeMyQuerySchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(appReadRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = req.query.facility_id ? String(req.query.facility_id) : undefined;
    const result = await getService().getCodesForUser(req.user!.userId, req.user!.role, req.user!.facilityIds, facilityId);
    res.json({ success: true, data: result });
  }),
);

registerGet(
  router,
  '/app/my',
  {
    openApiPath: `${MOUNT}/app/my`,
    tags: ['AccessCodes'],
    summary: 'Get app access codes for current user',
    security: 'bearer',
    query: accessCodeMyQuerySchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(appReadRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = req.query.facility_id ? String(req.query.facility_id) : undefined;
    const result = await getService().getAppCodesForUser(req.user!.userId, req.user!.role, req.user!.facilityIds, facilityId);
    res.json({ success: true, data: result });
  }),
);

registerGet(
  router,
  '/config/:facilityId',
  {
    openApiPath: `${MOUNT}/config/{facilityId}`,
    tags: ['AccessCodes'],
    summary: 'Get facility access code configuration',
    security: 'bearer',
    params: accessCodeFacilityIdParamSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    assertFacilityAccess(req, req.params.facilityId);
    const config = await getService().getConfig(req.params.facilityId);
    res.json({ success: true, data: config });
  }),
);

registerGet(
  router,
  '/push-state/:facilityId',
  {
    openApiPath: `${MOUNT}/push-state/{facilityId}`,
    tags: ['AccessCodes'],
    summary: 'Get access code push state for facility',
    security: 'bearer',
    params: accessCodeFacilityIdParamSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    assertFacilityAccess(req, req.params.facilityId);
    const state = getService().getPushState(req.params.facilityId);
    res.json({ success: true, data: state });
  }),
);

registerPut(
  router,
  '/config/:facilityId',
  {
    openApiPath: `${MOUNT}/config/{facilityId}`,
    tags: ['AccessCodes'],
    summary: 'Update facility access code configuration',
    security: 'bearer',
    params: accessCodeFacilityIdParamSchema,
    body: accessCodeConfigSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    assertFacilityAccess(req, req.params.facilityId);
    const config = await getService().upsertConfig(req.params.facilityId, req.body);
    res.json({ success: true, data: config });
  }),
);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['AccessCodes'],
    summary: 'List active access codes for facility',
    security: 'bearer',
    query: accessCodeFacilityQuerySchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.query.facility_id || '');
    assertFacilityAccess(req, facilityId);
    const scheduleId = req.query.schedule_id ? String(req.query.schedule_id) : undefined;
    const codes = await getService().getActiveCodesForFacility(facilityId, scheduleId);
    res.json({ success: true, data: codes });
  }),
);

registerGet(
  router,
  '/effective',
  {
    openApiPath: `${MOUNT}/effective`,
    tags: ['AccessCodes'],
    summary: 'List effective access codes for facility',
    security: 'bearer',
    query: accessCodeFacilityQuerySchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.query.facility_id || '');
    assertFacilityAccess(req, facilityId);
    const scheduleId = req.query.schedule_id ? String(req.query.schedule_id) : undefined;
    const codes = await getService().getEffectiveCodesForFacility(facilityId, scheduleId);
    res.json({ success: true, data: codes });
  }),
);

registerGet(
  router,
  '/groups/:groupId/config',
  {
    openApiPath: `${MOUNT}/groups/{groupId}/config`,
    tags: ['AccessCodes'],
    summary: 'Get device group access code configuration',
    security: 'bearer',
    params: accessCodeGroupIdParamSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = await getService().getGroupFacilityId(req.params.groupId);
    assertFacilityAccess(req, facilityId);
    const group = await getService().getGroupConfig(req.params.groupId);
    res.json({ success: true, data: group });
  }),
);

registerPut(
  router,
  '/groups/:groupId/config',
  {
    openApiPath: `${MOUNT}/groups/{groupId}/config`,
    tags: ['AccessCodes'],
    summary: 'Update device group access code configuration',
    security: 'bearer',
    params: accessCodeGroupIdParamSchema,
    body: accessCodeGroupConfigSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = await getService().getGroupFacilityId(req.params.groupId);
    assertFacilityAccess(req, facilityId);
    const config = await getService().upsertGroupConfig(req.params.groupId, req.body);
    res.json({ success: true, data: config });
  }),
);

registerPost(
  router,
  '/rotate',
  {
    openApiPath: `${MOUNT}/rotate`,
    tags: ['AccessCodes'],
    summary: 'Force rotate access codes',
    security: 'bearer',
    body: accessCodeRotateSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const value = req.body;
    assertFacilityAccess(req, value.facility_id);
    await getService().forceRotate(
      value.facility_id,
      value.scope_type,
      value.scope_id,
      req.user!.userId,
      value.schedule_id,
    );
    res.json({ success: true });
  }),
);

const handleManualSet = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body;
  assertFacilityAccess(req, value.facility_id);
  await getService().setManualCode(
    value.facility_id,
    value.scope_type,
    value.scope_id,
    value.code,
    req.user!.userId,
    value.schedule_id,
  );
  res.json({ success: true });
});

registerPut(
  router,
  '/manual/set',
  {
    openApiPath: `${MOUNT}/manual/set`,
    tags: ['AccessCodes'],
    summary: 'Set manual access code',
    security: 'bearer',
    body: accessCodeSetManualSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  handleManualSet,
);

registerPut(
  router,
  '/:id/set',
  {
    openApiPath: `${MOUNT}/{id}/set`,
    tags: ['AccessCodes'],
    summary: 'Set manual access code (legacy path)',
    security: 'bearer',
    params: accessCodeIdParamSchema,
    body: accessCodeSetManualSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  handleManualSet,
);

registerPost(
  router,
  '/push/:facilityId',
  {
    openApiPath: `${MOUNT}/push/{facilityId}`,
    tags: ['AccessCodes'],
    summary: 'Push access codes to gateway',
    security: 'bearer',
    params: accessCodeFacilityIdParamSchema,
    responses: {
      200: accessCodeResponseSchema,
    },
  },
  requireRoles(manageRoles),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    assertFacilityAccess(req, req.params.facilityId);
    await getService().pushCodesToGateway(req.params.facilityId);
    res.json({ success: true });
  }),
);

export { router as accessCodesRouter };
