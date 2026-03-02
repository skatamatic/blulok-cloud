import { Router, Response } from 'express';
import Joi from 'joi';
import { asyncHandler, ConflictError } from '@/middleware/error.middleware';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { DeviceGroupService } from '@/services/device-group.service';

const router = Router();
const service = DeviceGroupService.getInstance();

const manageRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN];

const createSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  group_type: Joi.string().valid('zone', 'access_code').default('zone'),
  is_global_shared: Joi.boolean().default(false),
  name: Joi.string().max(255).required(),
  description: Joi.string().allow('', null).optional(),
  settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
});

const updateSchema = Joi.object({
  group_type: Joi.string().valid('zone', 'access_code').optional(),
  is_global_shared: Joi.boolean().optional(),
  name: Joi.string().max(255).optional(),
  description: Joi.string().allow('', null).optional(),
  settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

const addMemberSchema = Joi.object({
  device_id: Joi.string().uuid().optional(),
  unit_id: Joi.string().uuid().optional(),
  device_type: Joi.string().valid('access_control', 'blulok').default('access_control'),
}).or('device_id', 'unit_id');

const removeMemberQuerySchema = Joi.object({
  device_type: Joi.string().valid('access_control', 'blulok').optional(),
});

router.use(authenticateToken);
router.use(requireRoles(manageRoles));

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = createSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }

  const group = await service.create(
    value,
    req.user!.role,
    req.user!.facilityIds,
    { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
  );
  res.status(201).json({ success: true, data: group });
}));

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = String(req.query.facility_id || '');
  const groupType = req.query.group_type ? String(req.query.group_type) : undefined;
  if (!facilityId) {
    res.status(400).json({ success: false, message: 'facility_id is required' });
    return;
  }
  if (groupType && groupType !== 'zone' && groupType !== 'access_code') {
    res.status(400).json({ success: false, message: 'group_type must be zone or access_code' });
    return;
  }
  const groups = await service.findByFacility(
    facilityId,
    req.user!.role,
    req.user!.facilityIds,
    groupType as 'zone' | 'access_code' | undefined,
  );
  res.json({ success: true, data: groups });
}));

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const group = await service.findById(req.params.id, req.user!.role, req.user!.facilityIds);
  const members = await service.getMembers(req.params.id, req.user!.role, req.user!.facilityIds);
  res.json({ success: true, data: { ...group, members } });
}));

router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = updateSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
  const group = await service.update(
    req.params.id,
    value,
    req.user!.role,
    req.user!.facilityIds,
    { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
  );
  res.json({ success: true, data: group });
}));

router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await service.delete(
    req.params.id,
    req.user!.role,
    req.user!.facilityIds,
    { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
  );
  res.json({ success: true });
}));

router.post('/:id/members', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = addMemberSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
  try {
    const member = await service.addMember(
      req.params.id,
      value.device_id,
      value.device_type,
      value.unit_id,
      req.user!.role,
      req.user!.facilityIds,
      { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
    );
    res.status(201).json({ success: true, data: member });
  } catch (serviceError) {
    if (serviceError instanceof ConflictError) {
      res.status(409).json({
        success: false,
        code: 'ACCESS_CODE_GROUP_MEMBERSHIP_CONFLICT',
        message: serviceError.message,
      });
      return;
    }
    throw serviceError;
  }
}));

router.delete('/:id/members/:deviceId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = removeMemberQuerySchema.validate(req.query);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }
  await service.removeMember(
    req.params.id,
    req.params.deviceId,
    value.device_type,
    req.user!.role,
    req.user!.facilityIds,
    { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
  );
  res.json({ success: true });
}));

export { router as deviceGroupsRouter };

