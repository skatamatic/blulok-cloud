import { Knex } from 'knex';
import { DatabaseService } from '@/services/database.service';
import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { PassesService, normalizeRoutePassUserRole } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserRole } from '@/types/auth.types';
import { resolveRoutePassSchedulesForAudiences, type RoutePassFacilitySchedule } from '@/services/passes/route-pass-schedules';
import {
  RoutePassError,
  resolveAuthoritativeRoutePassScope,
} from '@/services/passes/route-pass-context.service';

export { RoutePassError };

export interface RequestUserContext {
  userId: string;
  /** Optional facility filter from the client; validated against DB entitlements at issuance. */
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

    const { role, facilityIds, facilityId: requestedFacilityId } = await resolveAuthoritativeRoutePassScope(
      db,
      userId,
      ctx.facilityId,
    );

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

    // Resolve audiences from current DB entitlements only
    const audiences = await AudienceResolver.resolve(db, {
      userId,
      userRole: role,
      facilityIds,
      facilityId: requestedFacilityId,
    });

    const roleNorm = normalizeRoutePassUserRole(role);
    let schedules: RoutePassFacilitySchedule[] | undefined;
    // Privileged roles use empty aud + user_role on devices; do not embed schedules.
    if (roleNorm !== 'admin' && roleNorm !== 'dev_admin' && roleNorm !== 'facility_admin') {
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
      userRole: role,
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
