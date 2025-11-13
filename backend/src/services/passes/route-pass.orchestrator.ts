import { Knex } from 'knex';
import { DatabaseService } from '@/services/database.service';
import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { PassesService } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';

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

    // Sign pass
    const routePass = await PassesService.issueRoutePass({
      userId,
      devicePublicKey: device.public_key,
      audiences,
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


