/**
 * User Facilities Routes
 *
 * User-facility association management API for controlling which users have access
 * to which facilities.
 */

import { Router, Response } from 'express';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserModel, User } from '@/models/user.model';
import { AuthService } from '@/services/auth.service';
import { FacilityAccessService } from '@/services/facility-access.service';
import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireUserManagement } from '@/middleware/auth.middleware';
import {
  registerGet,
  registerPut,
  registerPost,
  registerDelete,
} from '@/openapi/register-route';
import {
  setUserFacilitiesSchema,
  userFacilitiesUserIdParamSchema,
  userFacilitiesAssociationParamSchema,
  userFacilitiesResponseSchema,
} from '@/schemas/user-facilities.schemas';

const router = Router();
const MOUNT = '/api/v1/user-facilities';

router.use(authenticateToken as any);
router.use(requireUserManagement as any);

function rejectFacilityAdminAssociationUnlessGlobalAdmin(
  targetUser: User,
  requesterRole: UserRole,
  res: Response,
): boolean {
  if (targetUser.role === UserRole.FACILITY_ADMIN && !AuthService.isGlobalAdmin(requesterRole)) {
    res.status(403).json({
      success: false,
      message: 'Only global administrators can manage facility admin associations',
    });
    return true;
  }
  return false;
}

registerGet(
  router,
  '/:userId',
  {
    openApiPath: `${MOUNT}/{userId}`,
    tags: ['Users'],
    summary: 'Get user facility associations',
    security: 'bearer',
    params: userFacilitiesUserIdParamSchema,
    responses: {
      200: userFacilitiesResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId } = req.params;

    const user = await UserModel.findById(userId) as User;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (AuthService.canAccessAllFacilities(user.role as UserRole)) {
      res.json({
        success: true,
        facilityIds: [],
        note: 'User has global access to all facilities',
      });
      return;
    }

    const facilityIds = await FacilityAccessService.getUserFacilityIds(userId, user.role as UserRole);

    res.json({
      success: true,
      facilityIds,
    });
  }),
);

registerPut(
  router,
  '/:userId',
  {
    openApiPath: `${MOUNT}/{userId}`,
    tags: ['Users'],
    summary: 'Set user facility associations',
    security: 'bearer',
    params: userFacilitiesUserIdParamSchema,
    body: setUserFacilitiesSchema,
    responses: {
      200: userFacilitiesResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { facilityIds } = req.body;

    const user = await UserModel.findById(userId) as User;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (AuthService.canAccessAllFacilities(user.role as UserRole)) {
      res.status(400).json({
        success: false,
        message: 'Global administrators do not require facility associations',
      });
      return;
    }

    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(400).json({
        success: false,
        message: 'Facility associations for tenants and maintenance users are managed automatically through unit assignments and key sharing',
      });
      return;
    }

    if (rejectFacilityAdminAssociationUnlessGlobalAdmin(user, req.user!.role as UserRole, res)) {
      return;
    }

    if (req.user!.role === UserRole.FACILITY_ADMIN) {
      const requesterFacilityIds = req.user!.facilityIds || [];
      const invalidFacilities = facilityIds.filter((id: string) => !requesterFacilityIds.includes(id));

      if (invalidFacilities.length > 0) {
        res.status(403).json({
          success: false,
          message: 'You can only assign users to facilities you manage',
        });
        return;
      }
    }

    await UserFacilityAssociationModel.setUserFacilities(userId, facilityIds);

    res.json({
      success: true,
      message: 'User facility associations updated successfully',
    });
  }),
);

registerPost(
  router,
  '/:userId/facilities/:facilityId',
  {
    openApiPath: `${MOUNT}/{userId}/facilities/{facilityId}`,
    tags: ['Users'],
    summary: 'Add user to facility',
    security: 'bearer',
    params: userFacilitiesAssociationParamSchema,
    responses: {
      200: userFacilitiesResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId, facilityId } = req.params;

    const user = await UserModel.findById(userId) as User;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(400).json({
        success: false,
        message: 'Facility associations for tenants and maintenance users are managed automatically through unit assignments and key sharing',
      });
      return;
    }

    if (rejectFacilityAdminAssociationUnlessGlobalAdmin(user, req.user!.role as UserRole, res)) {
      return;
    }

    if (req.user!.role === UserRole.FACILITY_ADMIN) {
      const requesterFacilityIds = req.user!.facilityIds || [];
      if (!requesterFacilityIds.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'You can only assign users to facilities you manage',
        });
        return;
      }
    }

    const hasAccess = await UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
    if (hasAccess) {
      res.status(400).json({
        success: false,
        message: 'User already has access to this facility',
      });
      return;
    }

    await UserFacilityAssociationModel.addUserToFacility(userId, facilityId);

    res.json({
      success: true,
      message: 'User added to facility successfully',
    });
  }),
);

registerDelete(
  router,
  '/:userId/facilities/:facilityId',
  {
    openApiPath: `${MOUNT}/{userId}/facilities/{facilityId}`,
    tags: ['Users'],
    summary: 'Remove user from facility',
    security: 'bearer',
    params: userFacilitiesAssociationParamSchema,
    responses: {
      200: userFacilitiesResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId, facilityId } = req.params;

    if (req.user!.role === UserRole.FACILITY_ADMIN) {
      const requesterFacilityIds = req.user!.facilityIds || [];
      if (!requesterFacilityIds.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'You can only remove users from facilities you manage',
        });
        return;
      }
    }

    const user = await UserModel.findById(userId) as User;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(400).json({
        success: false,
        message: 'Facility associations for tenants and maintenance users are managed automatically through unit assignments and key sharing',
      });
      return;
    }

    if (rejectFacilityAdminAssociationUnlessGlobalAdmin(user, req.user!.role as UserRole, res)) {
      return;
    }

    const removed = await UserFacilityAssociationModel.removeUserFromFacility(userId, facilityId);

    if (removed === 0) {
      res.status(404).json({
        success: false,
        message: 'Association not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'User removed from facility successfully',
    });
  }),
);

export { router as userFacilitiesRouter };
