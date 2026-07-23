import { DeviceModel } from '@/models/device.model';
import { UnitModel } from '@/models/unit.model';
import { UserModel } from '@/models/user.model';
import { UserRole } from '@/types/auth.types';
import { readBluLokLockNumber } from '@/utils/gateway-lock-inventory-map.utils';
import {
  coerceOptionalAccessId,
  isPlaceholderAccessString,
  isUsableAccessDisplayName,
  readMetadataNumber,
  readMetadataString,
} from '@/utils/access-event-placeholder.utils';
import {
  AccessEventActor,
  AccessEventActorRole,
  AccessEventPayload,
  ACCESS_EVENT_ACTOR_ROLES,
} from '@/services/access/access-event.types';

type ResolvedDevice = {
  id: string;
  facilityId: string | null;
  unitId: string | null;
  deviceType: 'blulok' | 'access_control';
};

/**
 * Enrich gateway access-event payloads with cloud truth for user, device, and unit.
 * Ignores placeholder name/role/unit fields when IDs are present.
 */
export class AccessEventEntityResolverService {
  private readonly deviceModel = new DeviceModel();
  private readonly unitModel = new UnitModel();

  public async resolve(
    event: AccessEventPayload,
    facilityId: string,
  ): Promise<AccessEventPayload> {
    const device = await this.resolveDevice(event, facilityId);
    const unitId = await this.resolveUnitId(event, facilityId, device);
    const actor = await this.resolveActor(event.actor);

    const next: AccessEventPayload = {
      ...event,
      device_id: device?.id ?? event.device_id,
      unit_id: unitId,
      actor,
    };

    if (device || unitId || actor) {
      const meta = { ...(event.metadata || {}) };
      if (device && device.id !== event.device_id) {
        meta.resolved_device_id = device.id;
        meta.gateway_device_id = event.device_id;
      }
      if (unitId && unitId !== event.unit_id) {
        meta.resolved_unit_id = unitId;
      }
      if (Object.keys(meta).length > 0) {
        next.metadata = meta;
      }
    }

    return next;
  }

  private async resolveDevice(
    event: AccessEventPayload,
    facilityId: string,
  ): Promise<ResolvedDevice | null> {
    const candidates = [
      coerceOptionalAccessId(event.device_id),
      coerceOptionalAccessId(readMetadataString(event.metadata, 'hardware_lock_id')),
      coerceOptionalAccessId(readMetadataString(event.metadata, 'lock_id')),
    ].filter((id, index, arr): id is string => Boolean(id) && arr.indexOf(id) === index);

    for (const candidate of candidates) {
      const resolved = await this.lookupDeviceInFacility(candidate, facilityId);
      if (resolved) return resolved;
    }

    const lockNumber = readMetadataNumber(event.metadata, 'lock_number');
    if (lockNumber != null) {
      const byNumber = await this.findBluLokByLockNumber(facilityId, lockNumber);
      if (byNumber) return byNumber;
    }

    return null;
  }

  private async lookupDeviceInFacility(
    deviceKey: string,
    facilityId: string,
  ): Promise<ResolvedDevice | null> {
    const blulok = await this.deviceModel.findBluLokDeviceById(deviceKey);
    if (blulok) {
      if (blulok.facility_id && blulok.facility_id !== facilityId) return null;
      return {
        id: blulok.id,
        facilityId: blulok.facility_id ?? null,
        unitId: blulok.unit_id ?? null,
        deviceType: 'blulok',
      };
    }

    const bySerial = await this.deviceModel.findBluLokDeviceByIdOrSerial(deviceKey);
    if (bySerial) {
      const withCtx = await this.deviceModel.findBluLokDeviceById(bySerial.id);
      if (withCtx?.facility_id && withCtx.facility_id !== facilityId) return null;
      return {
        id: bySerial.id,
        facilityId: withCtx?.facility_id ?? null,
        unitId: bySerial.unit_id ?? withCtx?.unit_id ?? null,
        deviceType: 'blulok',
      };
    }

    const ac = await this.deviceModel.findAccessControlDeviceWithGateway(deviceKey);
    if (ac) {
      if (ac.facility_id && ac.facility_id !== facilityId) return null;
      return {
        id: ac.id,
        facilityId: ac.facility_id ?? null,
        unitId: null,
        deviceType: 'access_control',
      };
    }

    return null;
  }

  private async findBluLokByLockNumber(
    facilityId: string,
    lockNumber: number,
  ): Promise<ResolvedDevice | null> {
    const devices = await this.deviceModel.findBluLokDevices({ facility_id: facilityId });
    const matches = devices.filter((d) => readBluLokLockNumber(d) === lockNumber);
    if (matches.length !== 1) return null;
    const device = matches[0];
    return {
      id: device.id,
      facilityId: device.facility_id ?? facilityId,
      unitId: device.unit_id ?? null,
      deviceType: 'blulok',
    };
  }

  private async resolveUnitId(
    event: AccessEventPayload,
    facilityId: string,
    device: ResolvedDevice | null,
  ): Promise<string | undefined> {
    const fromEvent = coerceOptionalAccessId(event.unit_id);
    const fromMetadata = coerceOptionalAccessId(readMetadataString(event.metadata, 'unit_id'));

    for (const candidate of [fromEvent, fromMetadata]) {
      if (!candidate) continue;
      const unit = await this.unitModel.findById(candidate);
      if (unit && unit.facility_id === facilityId) {
        return unit.id;
      }
    }

    if (device?.unitId) {
      const unit = await this.unitModel.findById(device.unitId);
      if (unit && unit.facility_id === facilityId) {
        return unit.id;
      }
      // Device mapping is facility-scoped already; trust device.unit_id when unit row missing.
      return device.unitId;
    }

    return undefined;
  }

  private async resolveActor(
    actor: AccessEventActor | undefined,
  ): Promise<AccessEventActor | undefined> {
    if (!actor) return undefined;

    const userId = coerceOptionalAccessId(actor.user_id);
    const appDeviceId = coerceOptionalAccessId(actor.app_device_id);

    if (!userId) {
      return {
        role: this.sanitizeActorRole(actor.role),
        name: isUsableAccessDisplayName(actor.name) ? actor.name!.trim() : undefined,
        app_device_id: appDeviceId,
      };
    }

    const user = (await UserModel.findById(userId)) as
      | { id: string; first_name?: string; last_name?: string; role?: string }
      | undefined;

    if (!user) {
      return {
        user_id: userId,
        role: this.sanitizeActorRole(actor.role),
        name: isUsableAccessDisplayName(actor.name) ? actor.name!.trim() : undefined,
        app_device_id: appDeviceId,
      };
    }

    const resolvedName = [user.first_name, user.last_name]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim();

    return {
      user_id: user.id,
      role: this.mapUserRoleToActorRole(user.role) ?? this.sanitizeActorRole(actor.role),
      name: resolvedName || (isUsableAccessDisplayName(actor.name) ? actor.name!.trim() : undefined),
      app_device_id: appDeviceId,
    };
  }

  private sanitizeActorRole(role: AccessEventActorRole | undefined): AccessEventActorRole {
    if (!role || isPlaceholderAccessString(role) || role === 'unknown') {
      return 'unknown';
    }
    return role;
  }

  private mapUserRoleToActorRole(role: string | undefined): AccessEventActorRole | undefined {
    if (!role) return undefined;
    if ((ACCESS_EVENT_ACTOR_ROLES as readonly string[]).includes(role)) {
      return role as AccessEventActorRole;
    }
    if (role === UserRole.BLULOK_TECHNICIAN) {
      return 'maintenance';
    }
    return undefined;
  }
}
