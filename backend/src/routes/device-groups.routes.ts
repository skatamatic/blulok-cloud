import { Router, Response } from 'express';
import { asyncHandler, ConflictError } from '@/middleware/error.middleware';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { DeviceGroupService } from '@/services/device-group.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  deviceGroupCreateSchema,
  deviceGroupUpdateSchema,
  deviceGroupAddMemberSchema,
  deviceGroupRemoveMemberQuerySchema,
  deviceGroupListQuerySchema,
  deviceGroupIdParamSchema,
  deviceGroupMemberParamSchema,
  deviceGroupResponseSchema,
} from '@/schemas/device-groups.schemas';

const router = Router();
const MOUNT = '/api/v1/device-groups';
const service = DeviceGroupService.getInstance();

const manageRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN];

router.use(authenticateToken);
router.use(requireRoles(manageRoles));

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['AccessCodes'],
    summary: 'Create a device group',
    security: 'bearer',
    body: deviceGroupCreateSchema,
    responses: {
      201: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const group = await service.create(
      req.body,
      req.user!.role,
      req.user!.facilityIds,
      { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
    );
    res.status(201).json({ success: true, data: group });
  }),
);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['AccessCodes'],
    summary: 'List device groups for facility',
    security: 'bearer',
    query: deviceGroupListQuerySchema,
    responses: {
      200: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.query.facility_id || '');
    const groupType = req.query.group_type ? String(req.query.group_type) : undefined;
    const groups = await service.findByFacility(
      facilityId,
      req.user!.role,
      req.user!.facilityIds,
      groupType as 'zone' | 'access_code' | undefined,
    );
    res.json({ success: true, data: groups });
  }),
);

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['AccessCodes'],
    summary: 'Get device group with members',
    security: 'bearer',
    params: deviceGroupIdParamSchema,
    responses: {
      200: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const group = await service.findById(req.params.id, req.user!.role, req.user!.facilityIds);
    const members = await service.getMembers(req.params.id, req.user!.role, req.user!.facilityIds);
    res.json({ success: true, data: { ...group, members } });
  }),
);

registerGet(
  router,
  '/:id/users',
  {
    openApiPath: `${MOUNT}/{id}/users`,
    tags: ['AccessCodes'],
    summary: 'List users with access to device group',
    security: 'bearer',
    params: deviceGroupIdParamSchema,
    responses: {
      200: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const users = await service.getUsersWithAccess(req.params.id, req.user!.role, req.user!.facilityIds);
    res.json({ success: true, data: users });
  }),
);

registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['AccessCodes'],
    summary: 'Update a device group',
    security: 'bearer',
    params: deviceGroupIdParamSchema,
    body: deviceGroupUpdateSchema,
    responses: {
      200: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const group = await service.update(
      req.params.id,
      req.body,
      req.user!.role,
      req.user!.facilityIds,
      { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
    );
    res.json({ success: true, data: group });
  }),
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['AccessCodes'],
    summary: 'Delete a device group',
    security: 'bearer',
    params: deviceGroupIdParamSchema,
    responses: {
      200: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await service.delete(
      req.params.id,
      req.user!.role,
      req.user!.facilityIds,
      { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
    );
    res.json({ success: true });
  }),
);

registerPost(
  router,
  '/:id/members',
  {
    openApiPath: `${MOUNT}/{id}/members`,
    tags: ['AccessCodes'],
    summary: 'Add member to device group',
    security: 'bearer',
    params: deviceGroupIdParamSchema,
    body: deviceGroupAddMemberSchema,
    responses: {
      201: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const member = await service.addMember(
        req.params.id,
        req.body.device_id,
        req.body.device_type,
        req.body.unit_id,
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
  }),
);

registerDelete(
  router,
  '/:id/members/:deviceId',
  {
    openApiPath: `${MOUNT}/{id}/members/{deviceId}`,
    tags: ['AccessCodes'],
    summary: 'Remove member from device group',
    security: 'bearer',
    params: deviceGroupMemberParamSchema,
    query: deviceGroupRemoveMemberQuerySchema,
    responses: {
      200: deviceGroupResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await service.removeMember(
      req.params.id,
      req.params.deviceId,
      req.query.device_type as 'access_control' | 'blulok' | undefined,
      req.user!.role,
      req.user!.facilityIds,
      { actorId: req.user!.userId, actorName: req.user!.email ?? undefined },
    );
    res.json({ success: true });
  }),
);

export { router as deviceGroupsRouter };
