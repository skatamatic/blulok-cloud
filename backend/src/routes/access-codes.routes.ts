import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { asyncHandler, AccessDeniedError } from '@/middleware/error.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { AccessCodeService } from '@/services/access-code.service';
import { AuthService } from '@/services/auth.service';

const router = Router();
const getService = (): AccessCodeService => AccessCodeService.getInstance();

const manageRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN];
const appReadRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN, UserRole.TENANT, UserRole.MAINTENANCE];

const configSchema = Joi.object({
  is_enabled: Joi.boolean().optional(),
  digit_count: Joi.number().integer().min(3).max(8).optional(),
  rotation_interval_hours: Joi.number().positive().optional(),
  rotation_hour: Joi.number().integer().min(0).max(23).optional(),
  rotation_minute: Joi.number().integer().min(0).max(59).optional(),
}).min(1);

const rotateSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  scope_type: Joi.string().valid('device_group', 'device').optional(),
  scope_id: Joi.string().uuid().allow(null).optional(),
  schedule_id: Joi.string().uuid().allow(null).optional(),
}).custom((value, helpers) => {
  if (!value.scope_type) return value;
  if ((value.scope_type === 'device' || value.scope_type === 'device_group') && !value.scope_id) {
    return helpers.error('any.invalid', { message: `scope_id is required for ${value.scope_type} scope` });
  }
  if (value.schedule_id && value.scope_type !== 'device_group') {
    return helpers.error('any.invalid', { message: 'schedule_id is only supported for device_group scope' });
  }
  return value;
});

const setManualSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  scope_type: Joi.string().valid('device_group', 'device').required(),
  scope_id: Joi.string().uuid().allow(null).optional(),
  code: Joi.string().pattern(/^[0-9]{3,8}$/).required(),
  schedule_id: Joi.string().uuid().allow(null).optional(),
}).custom((value, helpers) => {
  if ((value.scope_type === 'device' || value.scope_type === 'device_group') && !value.scope_id) {
    return helpers.error('any.invalid', { message: `scope_id is required for ${value.scope_type} scope` });
  }
  if (value.schedule_id && value.scope_type !== 'device_group') {
    return helpers.error('any.invalid', { message: 'schedule_id is only supported for device_group scope' });
  }
  return value;
});

const groupConfigSchema = Joi.object({
  is_enabled: Joi.boolean().optional(),
  digit_count: Joi.number().integer().min(3).max(8).optional(),
  rotation_interval_hours: Joi.number().positive().optional(),
  rotation_hour: Joi.number().integer().min(0).max(23).optional(),
  rotation_minute: Joi.number().integer().min(0).max(59).optional(),
}).min(1);

const assertFacilityAccess = (req: AuthenticatedRequest, facilityId: string): void => {
  const user = req.user!;
  if (AuthService.canAccessAllFacilities(user.role)) return;
  if (!user.facilityIds?.includes(facilityId)) {
    throw new AccessDeniedError('Access denied to this facility');
  }
};

router.use(authenticateToken);

router.get('/my', requireRoles(appReadRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = req.query.facility_id ? String(req.query.facility_id) : undefined;
  const result = await getService().getCodesForUser(req.user!.userId, req.user!.role, req.user!.facilityIds, facilityId);
  res.json({ success: true, data: result });
}));

router.get('/app/my', requireRoles(appReadRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = req.query.facility_id ? String(req.query.facility_id) : undefined;
  const result = await getService().getAppCodesForUser(req.user!.userId, req.user!.role, req.user!.facilityIds, facilityId);
  res.json({ success: true, data: result });
}));

router.get('/config/:facilityId', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  assertFacilityAccess(req, req.params.facilityId);
  const config = await getService().getConfig(req.params.facilityId);
  res.json({ success: true, data: config });
}));

router.get('/push-state/:facilityId', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  assertFacilityAccess(req, req.params.facilityId);
  const state = getService().getPushState(req.params.facilityId);
  res.json({ success: true, data: state });
}));

router.put('/config/:facilityId', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = configSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
  assertFacilityAccess(req, req.params.facilityId);
  const config = await getService().upsertConfig(req.params.facilityId, value);
  res.json({ success: true, data: config });
}));

router.get('/', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = String(req.query.facility_id || '');
  if (!facilityId) {
    res.status(400).json({ success: false, message: 'facility_id is required' });
    return;
  }
  assertFacilityAccess(req, facilityId);
  const scheduleId = req.query.schedule_id ? String(req.query.schedule_id) : undefined;
  const codes = await getService().getActiveCodesForFacility(facilityId, scheduleId);
  res.json({ success: true, data: codes });
}));

router.get('/effective', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = String(req.query.facility_id || '');
  if (!facilityId) {
    res.status(400).json({ success: false, message: 'facility_id is required' });
    return;
  }
  assertFacilityAccess(req, facilityId);
  const scheduleId = req.query.schedule_id ? String(req.query.schedule_id) : undefined;
  const codes = await getService().getEffectiveCodesForFacility(facilityId, scheduleId);
  res.json({ success: true, data: codes });
}));

router.get('/groups/:groupId/config', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = await getService().getGroupFacilityId(req.params.groupId);
  assertFacilityAccess(req, facilityId);
  const group = await getService().getGroupConfig(req.params.groupId);
  res.json({ success: true, data: group });
}));

router.put('/groups/:groupId/config', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = groupConfigSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
  const facilityId = await getService().getGroupFacilityId(req.params.groupId);
  assertFacilityAccess(req, facilityId);
  const config = await getService().upsertGroupConfig(req.params.groupId, value);
  res.json({ success: true, data: config });
}));

router.post('/rotate', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = rotateSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
  assertFacilityAccess(req, value.facility_id);
  await getService().forceRotate(
    value.facility_id,
    value.scope_type,
    value.scope_id,
    req.user!.userId,
    value.schedule_id,
  );
  res.json({ success: true });
}));

const handleManualSet = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = setManualSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
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

// Preferred endpoint
router.put('/manual/set', requireRoles(manageRoles), handleManualSet);
// Backward-compatible endpoint from early implementation
router.put('/:id/set', requireRoles(manageRoles), handleManualSet);

router.post('/push/:facilityId', requireRoles(manageRoles), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  assertFacilityAccess(req, req.params.facilityId);
  await getService().pushCodesToGateway(req.params.facilityId);
  res.json({ success: true });
}));

export { router as accessCodesRouter };

