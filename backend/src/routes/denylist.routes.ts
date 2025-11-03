/**
 * Denylist Routes
 *
 * API endpoints for managing and viewing device denylist entries.
 * Provides read access to denylist state and administrative controls.
 *
 * Key Features:
 * - View denylist entries by device or user
 * - Manual pruning trigger for administrators
 * - Audit trail and source tracking
 * - Facility-scoped access control
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full access to all denylist operations
 * - FACILITY_ADMIN: Access to denylist entries in their facilities only
 * - TENANT: No access (denylist is internal security mechanism)
 */
import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { DenylistPruningService } from '@/services/denylist-pruning.service';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

const router = Router();
router.use(authenticateToken);

// GET /api/v1/denylist/devices/:deviceId - Get denylist entries for a device
router.get('/devices/:deviceId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { deviceId } = req.params;
  const user = req.user!;

  // Check access: facility admin can only view devices in their facilities
  if (user.role === UserRole.FACILITY_ADMIN) {
    const knex = DatabaseService.getInstance().connection;
    const device = await knex('blulok_devices')
      .join('units', 'blulok_devices.unit_id', 'units.id')
      .where('blulok_devices.id', deviceId)
      .select('units.facility_id')
      .first();

    if (!device || !user.facilityIds?.includes(device.facility_id)) {
      res.status(403).json({
        success: false,
        message: 'Access denied to this device'
      });
      return;
    }
  }

  const denylistModel = new DenylistEntryModel();
  const entries = await denylistModel.findByDevice(deviceId);

  // Enrich entries with user information
  const knex = DatabaseService.getInstance().connection;
  const enrichedEntries = await Promise.all(
    entries.map(async (entry) => {
      const userInfo = await knex('users')
        .where('id', entry.user_id)
        .select('id', 'email', 'first_name', 'last_name')
        .first();

      return {
        ...entry,
        user: userInfo || { id: entry.user_id, email: null, first_name: null, last_name: null },
      };
    })
  );

  res.json({
    success: true,
    entries: enrichedEntries,
  });
}));

// GET /api/v1/denylist/users/:userId - Get denylist entries for a user
router.get('/users/:userId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId } = req.params;
  const user = req.user!;

  // Only admins can view user denylist entries
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
    return;
  }

  const denylistModel = new DenylistEntryModel();
  const entries = await denylistModel.findByUser(userId);

  // Enrich entries with device information
  const knex = DatabaseService.getInstance().connection;
  const enrichedEntries = await Promise.all(
    entries.map(async (entry) => {
      const device = await knex('blulok_devices')
        .join('units', 'blulok_devices.unit_id', 'units.id')
        .where('blulok_devices.id', entry.device_id)
        .select(
          'blulok_devices.id',
          'blulok_devices.device_serial',
          'units.unit_number',
          'units.facility_id'
        )
        .first();

      return {
        ...entry,
        device: device || { id: entry.device_id, device_serial: null, unit_number: null, facility_id: null },
      };
    })
  );

  res.json({
    success: true,
    entries: enrichedEntries,
  });
}));

// POST /api/v1/denylist/prune - Manually trigger pruning (admin only)
router.post('/prune', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;

  // Only admins can trigger manual pruning
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
    return;
  }

  try {
    const pruningService = DenylistPruningService.getInstance();
    const removed = await pruningService.prune();

    logger.info(`Manual denylist pruning triggered by ${user.userId}, removed ${removed} entries`);

    res.json({
      success: true,
      message: `Pruned ${removed} expired denylist entries`,
      removed,
    });
  } catch (error: any) {
    logger.error('Error during manual denylist pruning:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to prune denylist entries',
      error: error.message,
    });
  }
}));

export { router as denylistRouter };

