import { Router, Response } from 'express';
import Joi from 'joi';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserModel, User } from '@/models/user.model';
import { AuthService } from '@/services/auth.service';
import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireUserManagement } from '@/middleware/auth.middleware';

const router = Router();

// All routes require authentication and user management permissions
router.use(authenticateToken as any);
router.use(requireUserManagement as any);

// Validation schemas
const setFacilitiesSchema = Joi.object({
  facilityIds: Joi.array().items(Joi.string().min(1)).required()
});

// GET /user-facilities/:userId - Get user's facility associations
router.get('/:userId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }

  // Check if user exists
  const user = await UserModel.findById(userId) as User;
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // Global admins can access all facilities, so return empty array (they don't need associations)
  if (AuthService.canAccessAllFacilities(user.role as UserRole)) {
    res.json({
      success: true,
      facilityIds: [],
      note: 'User has global access to all facilities'
    });
    return;
  }

  // Get facility associations
  const facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);

  res.json({
    success: true,
    facilityIds
  });
}));

// PUT /user-facilities/:userId - Set user's facility associations
router.put('/:userId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }

  const { error, value } = setFacilitiesSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const { facilityIds } = value;

  // Check if user exists
  const user = await UserModel.findById(userId) as User;
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // Global admins don't need facility associations
  if (AuthService.canAccessAllFacilities(user.role as UserRole)) {
    res.status(400).json({
      success: false,
      message: 'Global administrators do not require facility associations'
    });
    return;
  }

  // Facility admins can only be managed by global admins
  if (user.role === UserRole.FACILITY_ADMIN && !AuthService.isGlobalAdmin(req.user!.role)) {
    res.status(403).json({
      success: false,
      message: 'Only global administrators can manage facility admin associations'
    });
    return;
  }

  // If requester is a facility admin, they can only assign users to their own facilities
  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    const requesterFacilityIds = req.user!.facilityIds || [];
    const invalidFacilities = facilityIds.filter((id: string) => !requesterFacilityIds.includes(id));
    
    if (invalidFacilities.length > 0) {
      res.status(403).json({
        success: false,
        message: 'You can only assign users to facilities you manage'
      });
      return;
    }
  }

  // Set facility associations
  await UserFacilityAssociationModel.setUserFacilities(userId, facilityIds);

  res.json({
    success: true,
    message: 'User facility associations updated successfully'
  });
}));

// POST /user-facilities/:userId/facilities/:facilityId - Add single facility association
router.post('/:userId/facilities/:facilityId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, facilityId } = req.params;

  if (!userId || !facilityId) {
    res.status(400).json({
      success: false,
      message: 'User ID and Facility ID are required'
    });
    return;
  }

  // Check if user exists
  const user = await UserModel.findById(userId) as User;
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // If requester is a facility admin, they can only assign users to their own facilities
  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    const requesterFacilityIds = req.user!.facilityIds || [];
    if (!requesterFacilityIds.includes(facilityId)) {
      res.status(403).json({
        success: false,
        message: 'You can only assign users to facilities you manage'
      });
      return;
    }
  }

  // Check if association already exists
  const hasAccess = await UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
  if (hasAccess) {
    res.status(400).json({
      success: false,
      message: 'User already has access to this facility'
    });
    return;
  }

  // Add association
  await UserFacilityAssociationModel.addUserToFacility(userId, facilityId);

  res.json({
    success: true,
    message: 'User added to facility successfully'
  });
}));

// DELETE /user-facilities/:userId/facilities/:facilityId - Remove single facility association
router.delete('/:userId/facilities/:facilityId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, facilityId } = req.params;

  if (!userId || !facilityId) {
    res.status(400).json({
      success: false,
      message: 'User ID and Facility ID are required'
    });
    return;
  }

  // If requester is a facility admin, they can only remove users from their own facilities
  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    const requesterFacilityIds = req.user!.facilityIds || [];
    if (!requesterFacilityIds.includes(facilityId)) {
      res.status(403).json({
        success: false,
        message: 'You can only remove users from facilities you manage'
      });
      return;
    }
  }

  // Remove association
  const removed = await UserFacilityAssociationModel.removeUserFromFacility(userId, facilityId);

  if (removed === 0) {
    res.status(404).json({
      success: false,
      message: 'Association not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'User removed from facility successfully'
  });
}));

export { router as userFacilitiesRouter };
