import { User } from '@/models/user.model';
import { DatabaseService } from '@/services/database.service';
import { AuthService } from '@/services/auth.service';
import { UserDevice, UserDeviceModel } from '@/models/user-device.model';
import { AppEntryAccessService } from '@/services/passes/app-entry-access.service';
import { AccessCodeService } from '@/services/access-code.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';

export interface UserFacilityWithUnits {
  facility_id: string;
  facility_name: string;
  facility_address: string | null;
  units: Array<{
    id: string;
    unitNumber: string;
    unitType: string | null;
    isPrimary: boolean;
    device?: {
      id: string;
      device_serial: string;
      lock_status: string | null;
      device_status: string | null;
      battery_level: number | null;
    };
  }>;
}

export type UserDeviceWithAssociations = UserDevice & {
  associatedLocks: Array<{
    user_device_id: string;
    lock_id: string;
    device_serial: string;
    unit_number: string;
    facility_name: string;
    key_status: string | null;
    last_error: string | null;
    key_version: number | null;
    key_code: string | null;
  }>;
  distributionErrors: Array<{
    user_device_id: string;
    last_error: string | null;
    updated_at: Date;
  }>;
};

export interface AccessControlDeviceWithCodes {
  id: string;
  device_id: string;
  access_id: string;
  relay_channel: number;
  facility_id: string;
  name: string;
  device_type: string | null;
  location_description: string | null;
  access_methods: string[];
  codes: Array<{
    code: string;
    valid_from: Date;
    valid_until: Date;
    schedule_id: string | null;
    schedule_name: string | null;
  }>;
}

export interface UserDetailsEnrichment {
  facilities: UserFacilityWithUnits[];
  devices: UserDeviceWithAssociations[];
  accessControlDevices: AccessControlDeviceWithCodes[];
}

/**
 * Service for enriching user details with facilities, units, devices, and access control entitlements.
 * Extracted from users.routes.ts GET /:id/details handler.
 */
export class UserDetailsService {
  private static instance: UserDetailsService;

  static getInstance(): UserDetailsService {
    if (!UserDetailsService.instance) {
      UserDetailsService.instance = new UserDetailsService();
    }
    return UserDetailsService.instance;
  }

  /**
   * Load enriched user details including facilities with units, registered devices,
   * and access control device entitlements.
   */
  async loadUserDetails(
    userId: string,
    user: User,
    options: { canLoadUserDevices: boolean },
  ): Promise<UserDetailsEnrichment> {
    const db = DatabaseService.getInstance().connection;

    const facilities = await this.loadFacilitiesWithUnits(db, userId);
    const facilityIds = facilities.map((f) => f.facility_id);

    let userDevices: UserDeviceWithAssociations[] = [];
    let accessControlDevices: AccessControlDeviceWithCodes[] = [];

    if (options.canLoadUserDevices) {
      userDevices = await this.loadUserDevicesWithAssociations(db, userId);
    }

    accessControlDevices = await this.loadAccessControlDevices(
      db,
      userId,
      user.role as UserRole,
      facilityIds.map(String),
    );

    return {
      facilities,
      devices: userDevices,
      accessControlDevices,
    };
  }

  private async loadFacilitiesWithUnits(
    db: ReturnType<typeof DatabaseService.getInstance>['connection'],
    userId: string,
  ): Promise<UserFacilityWithUnits[]> {
    const userFacilities = await db('user_facility_associations as ufa')
      .join('facilities as f', 'ufa.facility_id', 'f.id')
      .select(
        'f.id as facility_id',
        'f.name as facility_name',
        'f.address as facility_address',
      )
      .where('ufa.user_id', userId)
      .orderBy('f.name');

    const facilityIds = userFacilities.map((f) => f.facility_id);
    if (facilityIds.length === 0) {
      return [];
    }

    const unitsData = await db('unit_assignments as ua')
      .join('units as u', 'ua.unit_id', 'u.id')
      .leftJoin('blulok_devices as bd', 'u.id', 'bd.unit_id')
      .select(
        'u.facility_id',
        'u.id as unit_id',
        'u.unit_number',
        'u.unit_type',
        'ua.is_primary',
        'bd.id as device_id',
        'bd.device_serial',
        'bd.lock_status',
        'bd.device_status',
        'bd.battery_level',
      )
      .where('ua.tenant_id', userId)
      .whereIn('u.facility_id', facilityIds)
      .orderBy('u.unit_number');

    return userFacilities.map((facility) => ({
      ...facility,
      units: unitsData
        .filter((u) => u.facility_id === facility.facility_id)
        .map((u) => ({
          id: u.unit_id,
          unitNumber: u.unit_number,
          unitType: u.unit_type,
          isPrimary: u.is_primary,
          device: u.device_id
            ? {
                id: u.device_id,
                device_serial: u.device_serial,
                lock_status: u.lock_status,
                device_status: u.device_status,
                battery_level: u.battery_level,
              }
            : undefined,
        })),
    }));
  }

  private async loadUserDevicesWithAssociations(
    db: ReturnType<typeof DatabaseService.getInstance>['connection'],
    userId: string,
  ): Promise<UserDeviceWithAssociations[]> {
    const userDeviceModel = new UserDeviceModel();
    const rawDevices = await userDeviceModel.listByUser(userId);

    if (rawDevices.length === 0) {
      return [];
    }

    const deviceIds = rawDevices.map((d) => d.id);

    let lockAssociations: any[] = [];
    let distributionErrors: any[] = [];

    try {
      lockAssociations = await db('device_lock_associations as dla')
        .join('blulok_devices as bd', 'dla.lock_id', 'bd.id')
        .join('units as u', 'bd.unit_id', 'u.id')
        .join('facilities as f', 'u.facility_id', 'f.id')
        .select(
          'dla.user_device_id',
          'bd.id as lock_id',
          'bd.device_serial',
          'u.unit_number',
          'f.name as facility_name',
          'dla.key_status',
          'dla.last_error',
          'dla.key_version',
          'dla.key_code',
        )
        .whereIn('dla.user_device_id', deviceIds);

      distributionErrors = await db('device_lock_associations')
        .select('user_device_id', 'last_error', 'updated_at')
        .whereIn('user_device_id', deviceIds)
        .whereNotNull('last_error')
        .orderBy('updated_at', 'desc');
    } catch (error) {
      logger.warn('Failed to load device lock associations', {
        error: (error as Error)?.message || error,
      });
    }

    return rawDevices.map((device) => ({
      ...device,
      associatedLocks: lockAssociations.filter(
        (lock) => lock.user_device_id === device.id,
      ),
      distributionErrors: distributionErrors
        .filter((error) => error.user_device_id === device.id)
        .slice(0, 10),
    }));
  }

  private async loadAccessControlDevices(
    db: ReturnType<typeof DatabaseService.getInstance>['connection'],
    userId: string,
    userRole: UserRole,
    facilityIds: string[],
  ): Promise<AccessControlDeviceWithCodes[]> {
    try {
      const appEntryDeviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
        userId,
        userRole,
        facilityIds,
      });

      if (appEntryDeviceIds.length === 0) {
        return [];
      }

      const rows = await db('access_control_devices as d')
        .select(
          'd.id',
          'd.name',
          'd.device_type',
          'd.location_description',
          'd.device_serial',
          'd.relay_channel',
          'd.access_methods',
          'g.facility_id',
        )
        .join('gateways as g', 'g.id', 'd.gateway_id')
        .whereIn('d.id', appEntryDeviceIds)
        .orderBy('d.name', 'asc');

      const codesByDeviceId = new Map<
        string,
        Array<{
          code: string;
          valid_from: Date;
          valid_until: Date;
          schedule_id: string | null;
          schedule_name: string | null;
        }>
      >();

      try {
        const appCodes = await AccessCodeService.getInstance().getAppCodesForUser(
          userId,
          userRole,
          facilityIds,
        );
        appCodes.forEach((pairing) => {
          const list = codesByDeviceId.get(pairing.device_id) || [];
          list.push({
            code: pairing.code,
            valid_from: pairing.valid_from,
            valid_until: pairing.valid_until,
            schedule_id: pairing.schedule_id ?? null,
            schedule_name: pairing.schedule_name ?? null,
          });
          codesByDeviceId.set(pairing.device_id, list);
        });
      } catch (codeError) {
        logger.warn('Failed to load access codes for user details access-control devices', {
          userId,
          error: (codeError as Error)?.message || codeError,
        });
      }

      return rows.map((row) => {
        const rawMethods = row.access_methods;
        let accessMethods: string[] = [];
        if (Array.isArray(rawMethods)) {
          accessMethods = rawMethods.map((entry) => String(entry));
        } else if (typeof rawMethods === 'string') {
          try {
            const parsed = JSON.parse(rawMethods) as unknown;
            if (Array.isArray(parsed)) {
              accessMethods = parsed.map((entry) => String(entry));
            }
          } catch {
            accessMethods = [];
          }
        }
        return {
          id: String(row.id),
          device_id: String(row.id),
          access_id: String(row.device_serial),
          relay_channel: Number(row.relay_channel),
          facility_id: String(row.facility_id),
          name: String(row.name),
          device_type: row.device_type,
          location_description: row.location_description ?? null,
          access_methods: accessMethods,
          codes: (codesByDeviceId.get(String(row.id)) || []).sort((left, right) => {
            const leftSchedule = String(left.schedule_id ?? '');
            const rightSchedule = String(right.schedule_id ?? '');
            if (leftSchedule !== rightSchedule)
              return leftSchedule.localeCompare(rightSchedule);
            return String(left.code).localeCompare(String(right.code));
          }),
        };
      });
    } catch (error) {
      logger.warn('Failed to load access-control entitlements for user details', {
        userId,
        error: (error as Error)?.message || error,
      });
      return [];
    }
  }
}
