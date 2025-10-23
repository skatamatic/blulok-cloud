import { Router, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { UserRole } from '@/types/auth.types';
import { AuthenticatedRequest } from '@/types/auth.types';
import { SystemSettingsModel } from '@/models/system-settings.model';

const router = Router();

const updateSettingsSchema = Joi.object({
  'security.max_devices_per_user': Joi.number().integer().min(1).max(10).optional(),
}).min(1); // At least one setting must be provided

// GET /api/v1/system-settings
router.get('/', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }

  const model = new SystemSettingsModel();
  const maxDevices = await model.get('security.max_devices_per_user');
  res.json({
    success: true,
    settings: {
      'security.max_devices_per_user': parseInt(maxDevices || '2', 10)
    }
  });
}));

// PUT /api/v1/system-settings
router.put('/', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  const { error, value } = updateSettingsSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }

  const model = new SystemSettingsModel();
  if (value['security.max_devices_per_user'] !== undefined) {
    await model.set('security.max_devices_per_user', value['security.max_devices_per_user'].toString());
  }

  res.json({ success: true, message: 'Settings updated successfully' });
}));

export { router as systemSettingsRouter };
