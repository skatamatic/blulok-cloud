/**
 * Passes Routes (App)
 *
 * - POST /request: Issue a Route Pass (Ed25519 JWT) bound to the requesting device
 *   and the user's accessible lock audiences. Requires Bearer User JWT.
 *   Honors `X-App-Device-Id` to bind to the correct device public key.
 *
 * RBAC Scoping:
 * - DEV_ADMIN/ADMIN: all locks
 * - FACILITY_ADMIN: locks in their assigned facilities
 * - MAINTENANCE: locks for explicitly granted units (future)
 * - TENANT: locks for FMS-assigned units
 */
import { Router, Response } from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { DatabaseService } from '@/services/database.service';
import { PassesService } from '@/services/passes.service';
import { Knex } from 'knex';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { logger } from '@/utils/logger';

const router = Router();

// Rate limit pass requests to 20 per minute per user
const passRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many pass requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Resolve lock audiences based on user role and permissions.
 * No test-only fallbacks; tests must mock DB correctly.
 */
async function resolveAudiences(db: Knex, userId: string, userRole: UserRole, facilityIds?: string[]): Promise<string[]> {
  let lockIds: string[] = [];

  if (userRole === UserRole.DEV_ADMIN || userRole === UserRole.ADMIN) {
    // Global admins: all locks
    const rows = await db('blulok_devices').select('id');
    lockIds = rows.map((r: any) => r.id);
  } else if (userRole === UserRole.FACILITY_ADMIN) {
    // Facility admins: locks in their facilities
    if (!facilityIds || facilityIds.length === 0) {
      return [];
    }
    const rows = await db('blulok_devices as bd')
      .join('units as u', 'bd.unit_id', 'u.id')
      .whereIn('u.facility_id', facilityIds)
      .select('bd.id');
    lockIds = rows.map((r: any) => r.id);
  } else if (userRole === UserRole.TENANT) {
    // Tenants: locks for their assigned units
    const rows = await db('blulok_devices as bd')
      .join('unit_assignments as ua', 'ua.unit_id', 'bd.unit_id')
      .where('ua.tenant_id', userId)
      .select('bd.id');
    lockIds = rows.map((r: any) => r.id);
  } else if (userRole === UserRole.MAINTENANCE) {
    // Maintenance: locks for explicitly granted units (future; stub for now)
    // TODO: Implement maintenance_unit_access table join when available
    lockIds = [];
  } else {
    // Other roles have no lock access
    lockIds = [];
  }

  return lockIds.map((id: string) => `lock:${id}`);
}

// POST /api/v1/passes/request
router.post('/request', authenticateToken, passRequestLimiter, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  let facilityIds = req.user!.facilityIds as string[] | undefined;
  const db = DatabaseService.getInstance().connection;

  // Prefer the requesting device when provided
  const rawHeader = req.header('X-App-Device-Id');
  if (rawHeader !== undefined && rawHeader.trim().length === 0) {
    res.status(400).json({ success: false, message: 'X-App-Device-Id header, if provided, must be non-empty' });
    return;
  }
  const appDeviceId = (rawHeader || '').trim();
  let device: any | undefined;

  if (appDeviceId) {
    device = await db('user_devices')
      .where({ user_id: userId, app_device_id: appDeviceId })
      .whereIn('status', ['pending_key', 'active'])
      .first();
    if (!device?.public_key) {
      res.status(400).json({ success: false, message: 'Unknown or unregistered device for user' });
      return;
    }
  } else {
    device = await db('user_devices')
      .where({ user_id: userId })
      .whereIn('status', ['pending_key', 'active'])
      .orderBy('updated_at', 'desc')
      .first();
  }

  if (!device?.public_key) {
    res.status(409).json({ success: false, message: 'No registered device key' });
    return;
  }

  // Resolve audiences based on role
  if (userRole === UserRole.FACILITY_ADMIN && (!facilityIds || facilityIds.length === 0)) {
    // Fallback: load facility IDs from DB when not present on token
    facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
  }
  const audiences = await resolveAudiences(db, userId, userRole, facilityIds);

  const routePass = await PassesService.issueRoutePass({ userId, devicePublicKey: device.public_key, audiences });
  logger.info(`Issued Route Pass: user=${userId} device=${appDeviceId || 'latest'} audCount=${audiences.length}`);
  res.json({ success: true, routePass });
}));

export { router as passesRouter };


