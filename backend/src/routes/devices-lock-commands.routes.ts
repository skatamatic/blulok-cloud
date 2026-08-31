/**
 * Device Lock Command Routes
 *
 * HTTP endpoints for issuing lock/unlock commands to BluLok and access control devices.
 * Extracted from devices.routes.ts for modularity.
 *
 * Routes:
 * - PUT /blulok/:id/lock - BluLok lock/unlock with tenant override support
 * - POST /blulok/:id/occupied-unit-override - Register on-ground override intent
 * - PUT /access-control/:id/lock - Access control lock/unlock
 */

import { Router, Response } from 'express';
import { DeviceModel } from '@/models/device.model';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { assertJwtFacilityClaim } from '@/utils/facility-access-claim.utils';
import { requireRoles } from '@/middleware/auth.middleware';
import {
  registerPut,
  registerPost,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import {
  deviceIdParamSchema,
  lockStatusSchema,
  occupiedUnitOverrideBodySchema,
  accessControlLockCommandSchema,
  lockCommandResponseSchema,
} from '@/schemas/devices.schemas';
import { resolveTenantUnlockOverrideForRemoteUnlock } from '@/services/tenant-unlock-override.service';

const MOUNT = '/api/v1/devices';

/**
 * Registers device lock command routes on the provided router.
 *
 * @param router - Express router instance
 * @param deviceModel - Device model instance for database operations
 */
export function registerDeviceLockCommandRoutes(
  router: Router,
  deviceModel: DeviceModel,
): void {
  // PUT /api/devices/blulok/:id/lock - Issue BluLok lock/unlock command
  registerPut(
    router,
    '/blulok/:id/lock',
    {
      openApiPath: `${MOUNT}/blulok/{id}/lock`,
      tags: ['Devices', 'App'],
      summary: 'Issue BluLok lock or unlock command',
      security: 'bearer',
      params: deviceIdParamSchema,
      body: lockStatusSchema,
      responses: {
        200: lockCommandResponseSchema,
        400: errorEnvelopeSchema,
        403: errorEnvelopeSchema,
        404: errorEnvelopeSchema,
        502: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
    },
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user!;
        const id = req.params.id;
        const value = req.body;

        const knex = deviceModel['db'].connection;
        const deviceRow = await knex('blulok_devices')
          .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
          .select('blulok_devices.unit_id', 'gateways.facility_id', 'gateways.id as gateway_id', 'blulok_devices.lock_status')
          .where('blulok_devices.id', String(id))
          .first();

        if (!deviceRow) {
          res.status(404).json({ success: false, message: 'Device not found' });
          return;
        }

        // Access control:
        // - If device has a unit: user must have access to that unit
        // - If device has no unit: allow admin/dev_admin; facility_admin must have facility access
        if (deviceRow.unit_id) {
          const { UnitsService } = await import('@/services/units.service');
          const unitsService = UnitsService.getInstance();
          const hasAccess = await unitsService.hasUserAccessToUnit(deviceRow.unit_id, user.userId, user.role);
          if (!hasAccess) {
            res.status(403).json({ success: false, message: 'Insufficient permissions - unit access required' });
            return;
          }
        } else {
          // No unit associated
          if (user.role === UserRole.ADMIN || user.role === UserRole.DEV_ADMIN) {
            // allowed
          } else if (user.role === UserRole.FACILITY_ADMIN) {
            if (!assertJwtFacilityClaim(res, user, deviceRow.facility_id)) {
              return;
            }
          } else {
            res.status(403).json({ success: false, message: 'Insufficient permissions' });
            return;
          }
        }

        // If caller is explicitly setting lock_status=error, treat as direct override.
        // This is primarily for admin tooling and does not go through gateway commands.
        if (value.lock_status === 'error') {
          await deviceModel.updateLockStatus(String(id), 'error');
          res.json({ success: true, message: 'Lock status overridden to error' });
          return;
        }

        let tenantUnlockOverride:
          | { reason: string; reasonLabel: string; notes?: string }
          | undefined;

        if (value.lock_status === 'unlocked' && deviceRow.unit_id) {
          const resolution = await resolveTenantUnlockOverrideForRemoteUnlock({
            knex,
            unitId: String(deviceRow.unit_id),
            userId: user.userId,
            reasonRaw: value.tenant_override_reason,
            notesRaw: value.tenant_override_notes,
          });

          if (!resolution.ok) {
            res.status(resolution.status).json(resolution.body);
            return;
          }

          tenantUnlockOverride = resolution.override;
        }

        // For locked/unlocked, route through the LockCommandService so the device
        // enters a transitional state ('locking'/'unlocking') and we wait on gateway state updates.
        const { LockCommandService } = await import('@/services/lock-command.service');
        const lockCommandService = LockCommandService.getInstance();
        const result = await lockCommandService.issueLockCommand(
          String(id),
          value.lock_status,
          {
            userId: user.userId,
            userName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User',
            role: user.role,
          },
          { tenantUnlockOverride },
        );

        if (!result.success) {
          res.status(502).json({ success: false, message: result.message });
          return;
        }

        res.json({
          success: true,
          message: result.message,
          lock_status: result.lock_status,
          previous_status: result.previous_status,
        });
      } catch (error) {
        console.error('Error updating lock status:', error);
        res.status(500).json({ success: false, message: 'Failed to update lock status' });
      }
    },
  );

  // POST /api/devices/blulok/:id/occupied-unit-override — staff on-ground override intent
  registerPost(
    router,
    '/blulok/:id/occupied-unit-override',
    {
      openApiPath: `${MOUNT}/blulok/{id}/occupied-unit-override`,
      tags: ['Devices', 'App'],
      summary: 'Register Occupied Unit Override intent for on-ground (BLE) unlock',
      security: 'bearer',
      params: deviceIdParamSchema,
      body: occupiedUnitOverrideBodySchema,
      responses: {
        200: lockCommandResponseSchema,
        400: errorEnvelopeSchema,
        403: errorEnvelopeSchema,
        404: errorEnvelopeSchema,
        409: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
    },
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user!;
        const id = String(req.params.id);
        const value = req.body as { reason: string; notes?: string };

        const knex = deviceModel['db'].connection;
        const deviceRow = await knex('blulok_devices')
          .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
          .select(
            'blulok_devices.unit_id',
            'gateways.facility_id',
            'gateways.id as gateway_id',
          )
          .where('blulok_devices.id', id)
          .first();

        if (!deviceRow) {
          res.status(404).json({ success: false, message: 'Device not found' });
          return;
        }
        if (!deviceRow.unit_id) {
          res.status(400).json({
            success: false,
            message: 'Device is not assigned to a unit',
            code: 'TENANT_UNLOCK_OVERRIDE_NOT_REQUIRED',
          });
          return;
        }

        const { UnitsService } = await import('@/services/units.service');
        const hasAccess = await UnitsService.getInstance().hasUserAccessToUnit(
          String(deviceRow.unit_id),
          user.userId,
          user.role,
        );
        if (!hasAccess) {
          res.status(403).json({ success: false, message: 'Insufficient permissions - unit access required' });
          return;
        }

        const { unitHasTenant } = await import('@/utils/unit-has-tenant.utils');
        const { userIsUnitOccupantOrShareRecipient } = await import(
          '@/utils/unit-occupant-access.utils'
        );
        const occupied = await unitHasTenant(knex, String(deviceRow.unit_id));
        if (!occupied) {
          res.status(400).json({
            success: false,
            message: 'Occupied Unit Override is not required for vacant units',
            code: 'TENANT_UNLOCK_OVERRIDE_NOT_REQUIRED',
          });
          return;
        }

        const isOccupant = await userIsUnitOccupantOrShareRecipient(
          knex,
          String(deviceRow.unit_id),
          user.userId,
        );
        if (isOccupant) {
          res.status(400).json({
            success: false,
            message: 'Occupied Unit Override does not apply when unlocking your own unit',
            code: 'TENANT_UNLOCK_OVERRIDE_NOT_APPLICABLE',
          });
          return;
        }

        const {
          isTenantUnlockOverrideReasonCode,
          labelForTenantUnlockOverrideReason,
        } = await import('@/constants/tenant-unlock-override.constants');
        if (!isTenantUnlockOverrideReasonCode(value.reason)) {
          res.status(400).json({
            success: false,
            message: 'Invalid override reason',
            code: 'TENANT_UNLOCK_OVERRIDE_REQUIRED',
          });
          return;
        }

        const notesRaw = typeof value.notes === 'string' ? value.notes.trim() : '';
        const { OccupiedUnlockIntentService } = await import(
          '@/services/occupied-unlock-intent.service'
        );

        try {
          const intent = OccupiedUnlockIntentService.getInstance().createIntent({
            userId: user.userId,
            userName:
              [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
              || user.email
              || 'User',
            role: user.role,
            deviceId: id,
            unitId: String(deviceRow.unit_id),
            facilityId: String(deviceRow.facility_id),
            gatewayId: String(deviceRow.gateway_id),
            override: {
              reason: value.reason,
              reasonLabel: labelForTenantUnlockOverrideReason(value.reason),
              ...(notesRaw ? { notes: notesRaw } : {}),
            },
          });

          res.json({
            success: true,
            data: {
              intent_id: intent.intentId,
              expires_at: new Date(intent.expiresAtMs).toISOString(),
              device_id: intent.deviceId,
              unit_id: intent.unitId,
            },
          });
        } catch (err: unknown) {
          if (err instanceof Error && err.message === 'OCCUPIED_UNLOCK_INTENT_IN_USE') {
            res.status(409).json({
              success: false,
              message: 'Another override intent is already pending for this device',
              code: 'OCCUPIED_UNLOCK_INTENT_IN_USE',
            });
            return;
          }
          throw err;
        }
      } catch (error) {
        console.error('Error creating occupied unit override intent:', error);
        res.status(500).json({ success: false, message: 'Failed to create override intent' });
      }
    },
  );

  // PUT /api/devices/access-control/:id/lock — OPEN/CLOSE via gateway (same pipeline as BluLok)
  registerPut(
    router,
    '/access-control/:id/lock',
    {
      openApiPath: `${MOUNT}/access-control/{id}/lock`,
      tags: ['Devices', 'App'],
      summary: 'Issue access control lock or unlock command',
      security: 'bearer',
      params: deviceIdParamSchema,
      body: accessControlLockCommandSchema,
      responses: {
        200: lockCommandResponseSchema,
        400: errorEnvelopeSchema,
        403: errorEnvelopeSchema,
        404: errorEnvelopeSchema,
        502: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
    },
    requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user!;
        const id = req.params.id;
        const value = req.body;

        const knex = deviceModel['db'].connection;
        const deviceRow = await knex('access_control_devices')
          .join('gateways', 'access_control_devices.gateway_id', 'gateways.id')
          .select('gateways.facility_id')
          .where('access_control_devices.id', String(id))
          .first();

        if (!deviceRow) {
          res.status(404).json({ success: false, message: 'Device not found' });
          return;
        }

        if (user.role === UserRole.FACILITY_ADMIN) {
          if (!assertJwtFacilityClaim(res, user, deviceRow.facility_id)) {
            return;
          }
        }

        if (value.lock_status === 'error') {
          await knex('access_control_devices').where('id', String(id)).update({
            is_locked: true,
            updated_at: new Date(),
          });
          res.json({ success: true, message: 'Access control lock state overridden' });
          return;
        }

        const { LockCommandService } = await import('@/services/lock-command.service');
        const lockCommandService = LockCommandService.getInstance();
        const result = await lockCommandService.issueAccessControlLockCommand(
          String(id),
          value.lock_status as 'locked' | 'unlocked',
          {
            userId: user.userId,
            userName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User',
            role: user.role,
          },
          value.open_until !== undefined ? { openUntil: value.open_until } : undefined,
        );

        if (!result.success) {
          res.status(502).json({ success: false, message: result.message });
          return;
        }

        res.json({
          success: true,
          message: result.message,
        });
      } catch (error) {
        console.error('Error updating access-control lock status:', error);
        res.status(500).json({ success: false, message: 'Failed to update lock status' });
      }
    },
  );
}
