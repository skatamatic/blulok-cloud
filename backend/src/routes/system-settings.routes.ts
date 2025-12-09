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
import Joi from 'joi';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { UserRole } from '@/types/auth.types';
import { AuthenticatedRequest } from '@/types/auth.types';
import { SystemSettingsModel } from '@/models/system-settings.model';
import { NotificationsConfig } from '@/types/notification.types';
import { NotificationService } from '@/services/notifications/notification.service';
import { UserModel, User } from '@/models/user.model';

const router = Router();

const updateSettingsSchema = Joi.object({
  'security.max_devices_per_user': Joi.number().integer().min(0).max(250).optional(),
}).min(1); // At least one setting must be provided

const notificationsSchema = Joi.object({
  enabledChannels: Joi.object({
    sms: Joi.boolean(),
    email: Joi.boolean(),
  }),
  defaultProvider: Joi.object({
    sms: Joi.string().valid('twilio', 'console'),
    email: Joi.string().valid('console'),
  }),
  twilio: Joi.object({
    accountSid: Joi.string().optional(),
    authToken: Joi.string().optional(),
    fromNumber: Joi.string().optional(),
  }).optional(),
  templates: Joi.object({
    inviteSms: Joi.string().optional(),
    inviteEmail: Joi.string().optional(),
    inviteEmailSubject: Joi.string().optional(),
    otpSms: Joi.string().optional(),
    otpEmail: Joi.string().optional(),
    otpEmailSubject: Joi.string().optional(),
    passwordResetOtpSms: Joi.string().optional(),
    passwordResetOtpEmail: Joi.string().optional(),
    passwordResetOtpEmailSubject: Joi.string().optional(),
  }).optional(),
  deeplinkBaseUrl: Joi.string().optional(),
});

// GET /api/v1/system-settings
router.get('/', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }

  const model = new SystemSettingsModel();
  const maxDevices = await model.get('security.max_devices_per_user');
  const parsed = maxDevices !== undefined ? parseInt(maxDevices, 10) : NaN;
  const safeValue = Number.isNaN(parsed) ? 2 : parsed;
  res.json({
    success: true,
    settings: {
      'security.max_devices_per_user': safeValue
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

// GET /api/v1/system-settings/notifications
router.get('/notifications', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
}));

// PUT /api/v1/system-settings/notifications
router.put('/notifications', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }

  const { error, value } = notificationsSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }

  const model = new SystemSettingsModel();
  await model.set('notifications.config', JSON.stringify(value));

  res.json({ success: true, message: 'Notification settings updated successfully' });
}));

// POST /api/v1/system-settings/notifications/test
router.post('/notifications/test', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }

  const { toEmail, toPhone, configOverride } = req.body || {};

  // Determine recipients: defaults to current user profile
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

    // If nothing was sent and there are errors, return a 500 with details
    if ((result.sent?.length || 0) === 0 && (result.errors?.length || 0) > 0) {
      res.status(500).json({
        success: false,
        message: 'Failed to send test notifications',
        errors: result.errors,
      });
      return;
    }

    // Otherwise return success including any partial errors
    res.json({
      success: true,
      message: 'Test notifications dispatched',
      sent: result.sent,
      errors: result.errors,
      toEmail: targetEmail,
      toPhone: targetPhone
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send test notifications' });
  }
}));

export { router as systemSettingsRouter };
