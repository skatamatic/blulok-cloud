/**
 * User Devices Routes
 *
 * Manages user app device registrations for the new Route Pass security model.
 * - POST /register-key: Register device-bound Ed25519 public key (first time or new device)
 * - POST /me/rotate-key: Rotate device public key (e.g., after secure enclave key rotation)
 * - DELETE /me/:id: Revoke a device (tenant self-service)
 * - DELETE /admin/:id: Revoke any user's device (dev admin only)
 */
import { Router, Response } from 'express';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireDevAdmin } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { UserDeviceModel, UserDeviceStatus, AppPlatform } from '@/models/user-device.model';
import { DatabaseService } from '@/services/database.service';
import { SystemSettingsModel } from '@/models/system-settings.model';
import { registerGet, registerPost, registerDelete } from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import {
  registerDeviceSchema,
  rotateDeviceKeySchema,
  deviceIdParamSchema,
  userDevicesListResponseSchema,
  userDeviceResponseSchema,
  userDeviceSuccessResponseSchema,
  adminDeleteDeviceResponseSchema,
} from '@/schemas/user-devices.schemas';

const router = Router();
const MOUNT = '/api/v1/user-devices';

registerGet(
  router,
  '/me',
  {
    openApiPath: `${MOUNT}/me`,
    tags: ['App', 'Auth'],
    summary: 'Get current user registered devices',
    security: 'bearer',
    responses: {
      200: userDevicesListResponseSchema,
    },
  },
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const model = new UserDeviceModel();
    const devices = await model.listByUser(userId);
    res.json({ success: true, devices });
  }),
);

registerPost(
  router,
  '/register-key',
  {
    openApiPath: `${MOUNT}/register-key`,
    tags: ['App', 'Auth'],
    summary: 'Register device public key',
    security: 'bearer',
    body: registerDeviceSchema,
    responses: {
      200: userDeviceResponseSchema,
      400: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
    },
  },
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const value = req.body;

    const userId = req.user!.userId;
    const { app_device_id, platform, device_name, public_key } = value as { app_device_id: string; platform: AppPlatform; device_name?: string; public_key: string };

    // Enforce cap from settings (system-wide default 2; 0 = unlimited)
    const settingsModel = new SystemSettingsModel();
    const rawSetting = await settingsModel.get('security.max_devices_per_user');
    const parsedSetting = rawSetting !== undefined ? parseInt(rawSetting, 10) : NaN;
    const maxDevices = Number.isNaN(parsedSetting) ? 2 : parsedSetting;
    const enforceDeviceCap = maxDevices > 0;

    const model = new UserDeviceModel();
    const count = await model.countActiveByUser(userId);
    const existing = await model.findByUserAndAppDeviceId(userId, app_device_id);
    const isNew = !existing;
    if (enforceDeviceCap && isNew && count >= maxDevices) {
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
  }),
);

registerDelete(
  router,
  '/me/:id',
  {
    openApiPath: `${MOUNT}/me/{id}`,
    tags: ['App', 'Auth'],
    summary: 'Revoke a device for the current user',
    security: 'bearer',
    params: deviceIdParamSchema,
    responses: {
      200: userDeviceSuccessResponseSchema,
      400: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  }),
);

registerPost(
  router,
  '/me/rotate-key',
  {
    openApiPath: `${MOUNT}/me/rotate-key`,
    tags: ['App', 'Auth'],
    summary: 'Rotate device public key',
    security: 'bearer',
    body: rotateDeviceKeySchema,
    responses: {
      200: userDeviceSuccessResponseSchema,
      400: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const value = req.body;

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
  }),
);

registerDelete(
  router,
  '/admin/:id',
  {
    openApiPath: `${MOUNT}/admin/{id}`,
    tags: ['App', 'Auth'],
    summary: 'Delete any user device (dev admin only)',
    security: 'bearer',
    params: deviceIdParamSchema,
    responses: {
      200: adminDeleteDeviceResponseSchema,
      400: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  authenticateToken,
  requireDevAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  }),
);

export { router as userDevicesRouter };
