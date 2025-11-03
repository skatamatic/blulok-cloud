/**
 * User Devices Routes
 *
 * Manages user app device registrations for the new Route Pass security model.
 * - POST /register-key: Register device-bound Ed25519 public key (first time or new device)
 * - POST /me/rotate-key: Rotate device public key (e.g., after secure enclave key rotation)
 * - DELETE /me/:id: Revoke a device (tenant self-service)
 * - DELETE /admin/:id: Revoke any user's device (dev admin only)
 */
import { Router, Response, RequestHandler, NextFunction } from 'express';
import Joi from 'joi';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { UserDeviceModel, UserDeviceStatus, AppPlatform } from '@/models/user-device.model';
import { DatabaseService } from '@/services/database.service';

// Middleware to check if user is a dev admin
const requireDevAdmin: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user!.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Access denied. Dev admin role required.' });
    return;
  }
  next();
};

const router = Router();

// Middleware to check if user is a tenant
const requireTenant: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user!.role !== UserRole.TENANT) {
    res.status(403).json({ success: false, message: 'Access denied. Tenant role required.' });
    return;
  }
  next();
};

const registerSchema = Joi.object({
  app_device_id: Joi.string().max(128).required(),
  platform: Joi.string().valid('ios', 'android', 'web', 'other').required(),
  device_name: Joi.string().max(255).allow('', null),
  public_key: Joi.string().base64({ paddingRequired: true }).required(),
});

const rotateSchema = Joi.object({
  public_key: Joi.string().base64({ paddingRequired: true }).required(),
});

// GET /api/v1/user-devices/me
router.get('/me', authenticateToken, requireTenant, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const model = new UserDeviceModel();
  const devices = await model.listByUser(userId);
  res.json({ success: true, devices });
}));

// POST /api/v1/user-devices/register-key
router.post('/register-key', authenticateToken, requireTenant, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  const userId = req.user!.userId;
  const { app_device_id, platform, device_name, public_key } = value as { app_device_id: string; platform: AppPlatform; device_name?: string; public_key: string };

  // Enforce cap from settings (system-wide default 2)
  const db = DatabaseService.getInstance().connection;
  const settings = await db('system_settings').where({ key: 'security.max_devices_per_user' }).first();
  const maxDevices = parseInt(settings?.value || '2', 10) || 2;

  const model = new UserDeviceModel();
  const count = await model.countActiveByUser(userId);
  const existing = await model.findByUserAndAppDeviceId(userId, app_device_id);
  const isNew = !existing;
  if (isNew && count >= maxDevices) {
    const current = await model.listByUser(userId);
    res.status(409).json({ success: false, message: 'Device limit reached', maxDevices, devices: current });
    return;
  }

  // Device is immediately active since registration includes public key
  // No need for a subsequent key rotation step
  const status: UserDeviceStatus = 'active';
  const device = await model.upsertByUserAndAppDeviceId(userId, app_device_id, {
    platform,
    device_name,
    public_key,
    status,
    last_used_at: new Date(),
  } as any);

  res.json({ success: true, device });
}));

// DELETE /api/v1/user-devices/me/:id
router.delete('/me/:id', authenticateToken, requireTenant, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, message: 'Device ID is required' });
    return;
  }

  const model = new UserDeviceModel();
  const device = await DatabaseService.getInstance().connection('user_devices').where({ id, user_id: userId }).first();
  if (!device) {
    res.status(404).json({ success: false, message: 'Device not found' });
    return;
  }
  await model.revoke(id);
  res.json({ success: true });
}));

// POST /api/v1/user-devices/me/rotate-key
router.post('/me/rotate-key', authenticateToken, requireTenant, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = rotateSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  // Require device id from header (same mechanism as first-time login)
  const appDeviceId = (req.header('X-App-Device-Id') || '').trim();
  if (!appDeviceId) {
    res.status(400).json({ success: false, message: 'X-App-Device-Id header is required' });
    return;
  }

  const userId = req.user!.userId;
  const { public_key } = value as { public_key: string };

  const model = new UserDeviceModel();
  const device = await model.findByUserAndAppDeviceId(userId, appDeviceId);
  if (!device) {
    res.status(404).json({ success: false, message: 'Device not found for user' });
    return;
  }

  // Update device public key and activate
  await model.upsertByUserAndAppDeviceId(userId, appDeviceId, {
    public_key,
    status: 'active',
    last_used_at: new Date(),
  } as any);

  res.json({ success: true });
}));

// DELETE /api/v1/user-devices/admin/:id - Delete any user device (dev admin only)
router.delete('/admin/:id', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const deviceId = req.params.id;
  if (!deviceId) {
    res.status(400).json({ success: false, message: 'Device ID is required' });
    return;
  }

  const model = new UserDeviceModel();

  // Check if device exists
  const device = await DatabaseService.getInstance().connection('user_devices').where({ id: deviceId }).first();
  if (!device) {
    res.status(404).json({ success: false, message: 'Device not found' });
    return;
  }

  await model.revoke(deviceId);

  res.json({
    success: true,
    message: 'Device deleted successfully'
  });
}));

export { router as userDevicesRouter };


