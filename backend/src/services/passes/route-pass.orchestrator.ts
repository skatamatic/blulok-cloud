import { Knex } from 'knex';
import { DatabaseService } from '@/services/database.service';
import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { PassesService } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';
import { UserFacilityScheduleModel } from '@/models/user-facility-schedule.model';
import { ScheduleModel } from '@/models/schedule.model';

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

    // Ensure facilityIds for facility admin
    let facilityIds = ctx.facilityIds;
    if (ctx.role === UserRole.FACILITY_ADMIN && (!facilityIds || facilityIds.length === 0)) {
      facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
    }

    // Resolve audiences
    const audiences = await AudienceResolver.resolve(db, {
      userId,
      userRole: ctx.role,
      facilityIds,
    });

    // Fetch user's schedule for the first facility they have access to
    // For shared keys, we'll inherit from primary tenant (handled below)
    let schedule: {
      facility_id: string;
      time_windows: Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
      }>;
    } | undefined;

    // Get facility IDs if not already available
    let effectiveFacilityIds = facilityIds;
    if (!effectiveFacilityIds || effectiveFacilityIds.length === 0) {
      if (ctx.role === UserRole.TENANT || ctx.role === UserRole.MAINTENANCE || ctx.role === UserRole.FACILITY_ADMIN) {
        effectiveFacilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
      }
    }

    // Get schedule for first facility (if user has facility access)
    if (effectiveFacilityIds && effectiveFacilityIds.length > 0) {
      const firstFacilityId = effectiveFacilityIds[0];
      const userSchedule = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
        userId,
        firstFacilityId
      );

      if (userSchedule && userSchedule.schedule.time_windows.length > 0) {
        schedule = {
          facility_id: firstFacilityId,
          time_windows: userSchedule.schedule.time_windows.map(tw => ({
            day_of_week: tw.day_of_week,
            start_time: tw.start_time,
            end_time: tw.end_time,
          })),
        };
      }
    }

    // For shared key audiences, inherit schedule from primary tenant
    // Extract unique primary tenant IDs from shared_key audiences
    const sharedKeyPrimaryTenantIds = new Set<string>();
    audiences.forEach(aud => {
      if (aud.startsWith('shared_key:')) {
        const parts = aud.split(':');
        if (parts.length >= 3) {
          sharedKeyPrimaryTenantIds.add(parts[1]);
        }
      }
    });

    // If we have shared keys and no schedule yet, try to get schedule from primary tenant
    if (sharedKeyPrimaryTenantIds.size > 0 && !schedule) {
      // Get facility ID from one of the shared locks
      const sharedAudience = audiences.find(aud => aud.startsWith('shared_key:'));
      if (sharedAudience) {
        const parts = sharedAudience.split(':');
        const primaryTenantId = parts[1];
        const lockId = parts[2];

        // Get facility ID from lock
        const lockRow = await db('blulok_devices as bd')
          .join('units as u', 'bd.unit_id', 'u.id')
          .where('bd.id', lockId)
          .select('u.facility_id')
          .first();

        if (lockRow?.facility_id) {
          const facilityId = lockRow.facility_id as string;
          const primaryTenantSchedule = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
            primaryTenantId,
            facilityId
          );

          if (primaryTenantSchedule && primaryTenantSchedule.schedule.time_windows.length > 0) {
            schedule = {
              facility_id: facilityId,
              time_windows: primaryTenantSchedule.schedule.time_windows.map(tw => ({
                day_of_week: tw.day_of_week,
                start_time: tw.start_time,
                end_time: tw.end_time,
              })),
            };
          }
        }
      }
    }

    // Sign pass
    const routePass = await PassesService.issueRoutePass({
      userId,
      devicePublicKey: device.public_key,
      audiences,
      schedule,
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


