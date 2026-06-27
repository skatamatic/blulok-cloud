/**
 * System Settings Routes
 *
 * Dynamic system configuration management API providing runtime configuration
 * capabilities for system administrators. Enables configuration changes without
 * code deployments while maintaining security and audit trails.
 *
 * Key Features:
 * - Runtime configuration management without restarts
 * - Type-safe configuration validation with Joi schemas
 * - Role-based access control (ADMIN/DEV_ADMIN only)
 * - Audit trail for all configuration changes
 * - Secure storage with encryption for sensitive settings
 *
 * Configuration Categories:
 * - Security settings (device limits, authentication policies)
 * - Performance settings (timeouts, rate limits, caching)
 * - Feature flags (enable/disable functionality)
 * - Integration settings (API endpoints, credentials)
 * - Operational settings (maintenance modes, logging levels)
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full read/write access to all settings
 * - FACILITY_ADMIN/TENANT/MAINTENANCE: No access to system settings
 *
 * Setting Types:
 * - Numeric values (device limits, timeouts)
 * - Boolean flags (feature toggles, maintenance modes)
 * - String values (API endpoints, configuration strings)
 * - JSON objects (complex configuration structures)
 *
 * Security Considerations:
 * - Strict role-based access control
 * - Input validation on all setting values
 * - Audit logging for all configuration changes
 * - Secure storage for sensitive configuration
 * - Configuration change notifications
 */

import { Router, Response } from 'express';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { UserRole } from '@/types/auth.types';
import { AuthenticatedRequest } from '@/types/auth.types';
import { SystemSettingsModel } from '@/models/system-settings.model';
import { NotificationsConfig } from '@/types/notification.types';
import { NotificationService } from '@/services/notifications/notification.service';
import { UserModel, User } from '@/models/user.model';
import { logger } from '@/utils/logger';
import { registerGet, registerPost, registerPut } from '@/openapi/register-route';
import {
  updateSystemSettingsBodySchema,
  notificationsConfigBodySchema,
} from '@/schemas/system-settings.schemas';

const router = Router();
const MOUNT = '/api/v1/system-settings';

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['System'],
    summary: 'Get system settings',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const model = new SystemSettingsModel();
    const maxDevices = await model.get('security.max_devices_per_user');
    const parsed = maxDevices !== undefined ? parseInt(maxDevices, 10) : NaN;
    const safeValue = Number.isNaN(parsed) ? 2 : parsed;

    const blufmsDemoEnabled = await model.get('dev.blufms_demo_enabled');
    const blufmsDemoValue = blufmsDemoEnabled === 'true';

    const bluDesignEnabled = await model.get('dev.bludesign_enabled');
    const bluDesignValue = bluDesignEnabled === 'true';

    res.json({
      success: true,
      settings: {
        'security.max_devices_per_user': safeValue,
        'dev.blufms_demo_enabled': blufmsDemoValue,
        'dev.bludesign_enabled': bluDesignValue,
      },
    });
  }),
);

registerPut(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['System'],
    summary: 'Update system settings',
    security: 'bearer',
    body: updateSystemSettingsBodySchema,
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const value = req.body;

    const model = new SystemSettingsModel();
    if (value['security.max_devices_per_user'] !== undefined) {
      await model.set('security.max_devices_per_user', value['security.max_devices_per_user'].toString());
    }
    if (value['dev.blufms_demo_enabled'] !== undefined) {
      await model.set('dev.blufms_demo_enabled', value['dev.blufms_demo_enabled'].toString());
    }
    if (value['dev.bludesign_enabled'] !== undefined) {
      await model.set('dev.bludesign_enabled', value['dev.bludesign_enabled'].toString());
    }

    res.json({ success: true, message: 'Settings updated successfully' });
  }),
);

registerGet(
  router,
  '/notifications',
  {
    openApiPath: `${MOUNT}/notifications`,
    tags: ['System'],
    summary: 'Get notification settings',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const model = new SystemSettingsModel();
    const raw = await model.get('notifications.config');
    let config: NotificationsConfig;

    if (!raw) {
      config = {
        enabledChannels: { sms: true, email: false },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {
          inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}}',
          otpSms: 'Your verification code is: {{code}}',
        },
        deeplinkBaseUrl: 'blulok://invite',
      };
    } else {
      try {
        config = JSON.parse(raw);
      } catch {
        config = {
          enabledChannels: { sms: true, email: false },
          defaultProvider: { sms: 'console', email: 'console' },
          templates: {
            inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}}',
            otpSms: 'Your verification code is: {{code}}',
          },
          deeplinkBaseUrl: 'blulok://invite',
        };
      }
    }

    res.json({ success: true, config });
  }),
);

registerPut(
  router,
  '/notifications',
  {
    openApiPath: `${MOUNT}/notifications`,
    tags: ['System'],
    summary: 'Update notification settings',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    logger.debug('Notification settings update request:', JSON.stringify(req.body, null, 2));

    const { error, value } = notificationsConfigBodySchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) {
      const errorMessages = error.details.map(d => d.message).join('; ');
      logger.error('Notification settings validation error:', errorMessages, error.details);
      res.status(400).json({
        success: false,
        message: errorMessages || 'Validation error',
        details: error.details,
      });
      return;
    }

    const model = new SystemSettingsModel();
    await model.set('notifications.config', JSON.stringify(value));

    res.json({ success: true, message: 'Notification settings updated successfully' });
  }),
);

registerPost(
  router,
  '/notifications/test',
  {
    openApiPath: `${MOUNT}/notifications/test`,
    tags: ['System'],
    summary: 'Send test notifications',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const { toEmail, toPhone, configOverride } = req.body || {};

    let targetEmail: string | undefined = toEmail;
    let targetPhone: string | undefined = toPhone;

    if (!targetEmail || !targetPhone) {
      const profile = await UserModel.findById(user.userId) as User | undefined;
      if (!targetEmail && profile?.email) targetEmail = profile.email || undefined;
      if (!targetPhone && profile?.phone_number) targetPhone = profile.phone_number || undefined;
    }

    if (!targetEmail && !targetPhone) {
      res.status(400).json({ success: false, message: 'No recipient found. Provide toEmail/toPhone or set your email/phone.' });
      return;
    }

    const notifications = NotificationService.getInstance();
    try {
      const result = await notifications.sendTestNotifications({ toEmail: targetEmail, toPhone: targetPhone }, configOverride);

      if ((result.sent?.length || 0) === 0 && (result.errors?.length || 0) > 0) {
        res.status(500).json({
          success: false,
          message: 'Failed to send test notifications',
          errors: result.errors,
        });
        return;
      }

      res.json({
        success: true,
        message: 'Test notifications dispatched',
        sent: result.sent,
        errors: result.errors,
        toEmail: targetEmail,
        toPhone: targetPhone,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message || 'Failed to send test notifications' });
    }
  }),
);

export { router as systemSettingsRouter };
