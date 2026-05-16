import { Knex } from 'knex';
import { DatabaseService } from '@/services/database.service';
import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { PassesService, normalizeRoutePassUserRole } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';
import { resolveRoutePassSchedulesForAudiences, type RoutePassFacilitySchedule } from '@/services/passes/route-pass-schedules';

export class RoutePassError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface RequestUserContext {
  userId: string;
  role: UserRole;
  facilityIds?: string[];
  facilityId?: string;
}

export class RoutePassOrchestrator {
  public static async issueForUser(ctx: RequestUserContext, appDeviceIdHeader?: string): Promise<string> {
    const db: Knex = DatabaseService.getInstance().connection;
    const userId = ctx.userId;

    const header = (appDeviceIdHeader || '').trim();
    if (appDeviceIdHeader !== undefined && header.length === 0) {
      throw new RoutePassError('X-App-Device-Id header, if provided, must be non-empty', 400);
    }

    // Resolve device
    let device: any | undefined;
    if (header) {
      device = await db('user_devices')
        .where({ user_id: userId, app_device_id: header })
        .whereIn('status', ['pending_key', 'active'])
        .first();
      if (!device?.public_key) {
        throw new RoutePassError('Unknown or unregistered device for user', 400);
      }
    } else {
      device = await db('user_devices')
        .where({ user_id: userId })
        .whereIn('status', ['pending_key', 'active'])
        .orderBy('updated_at', 'desc')
        .first();
    }

    if (!device?.public_key) {
      throw new RoutePassError('No registered device key', 409);
    }

    // Ensure facilityIds for scoped roles
    let facilityIds = ctx.facilityIds;
    if (ctx.role === UserRole.FACILITY_ADMIN && (!facilityIds || facilityIds.length === 0)) {
      facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
    }

    if (
      (ctx.role === UserRole.TENANT || ctx.role === UserRole.MAINTENANCE)
      && (!facilityIds || facilityIds.length === 0)
    ) {
      facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
    }

    let requestedFacilityId: string | undefined;
    if (ctx.facilityId) {
      if (ctx.role === UserRole.ADMIN || ctx.role === UserRole.DEV_ADMIN) {
        const facility = await db('facilities')
          .select('id')
          .where('id', ctx.facilityId)
          .first();
        if (!facility) {
          throw new RoutePassError('Requested facility was not found', 404);
        }
      } else {
        if (!facilityIds?.includes(ctx.facilityId)) {
          throw new RoutePassError('Access denied to requested facility', 403);
        }
      }
      requestedFacilityId = ctx.facilityId;
      facilityIds = [requestedFacilityId];
    }

    // Resolve audiences
    const audiences = await AudienceResolver.resolve(db, {
      userId,
      userRole: ctx.role,
      facilityIds,
      facilityId: requestedFacilityId,
    });

    const roleNorm = normalizeRoutePassUserRole(ctx.role);
    let schedules: RoutePassFacilitySchedule[] | undefined;
    if (roleNorm !== 'admin' && roleNorm !== 'dev_admin') {
      const resolved = await resolveRoutePassSchedulesForAudiences(db, userId, audiences);
      if (resolved.length > 0) {
        schedules = resolved;
      }
    }

    // Sign pass
    const routePass = await PassesService.issueRoutePass({
      userId,
      devicePublicKey: device.public_key,
      audiences,
      schedules,
      userRole: ctx.role,
    });

    // Log issuance
    try {
      const { RoutePassIssuanceModel } = await import('@/models/route-pass-issuance.model');
      const routePassModel = new RoutePassIssuanceModel();
      const payload = await Ed25519Service.verifyJwt(routePass);
      const jti = payload.jti as string;
      const iat = payload.iat as number;
      const exp = payload.exp as number;

      await routePassModel.create({
        userId,
        deviceId: device.id,
        audiences,
        jti,
        issuedAt: new Date(iat * 1000),
        expiresAt: new Date(exp * 1000),
      });
    } catch {
      // Non-fatal
    }

    return routePass;
  }
}
