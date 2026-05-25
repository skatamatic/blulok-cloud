import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';
import {
  FACILITY_OPERATOR_ROLES,
  GLOBAL_OPERATOR_ROLES,
} from '@/constants/in-app-notification.constants';

/**
 * Resolves which users should receive facility-scoped or global in-app notifications.
 */
export class InAppNotificationAudienceService {
  private static instance: InAppNotificationAudienceService;
  private readonly db = DatabaseService.getInstance();

  public static getInstance(): InAppNotificationAudienceService {
    if (!InAppNotificationAudienceService.instance) {
      InAppNotificationAudienceService.instance = new InAppNotificationAudienceService();
    }
    return InAppNotificationAudienceService.instance;
  }

  /**
   * Users who operate a facility: global admins + facility admins assigned to the facility.
   */
  public async resolveFacilityOperators(
    facilityId: string,
    options?: { excludeUserIds?: string[]; roles?: UserRole[] },
  ): Promise<string[]> {
    const roles = options?.roles ?? FACILITY_OPERATOR_ROLES;
    const knex = this.db.connection;

    const globalRoles = roles.filter((r) =>
      r === UserRole.ADMIN || r === UserRole.DEV_ADMIN,
    );
    const scopedRoles = roles.filter((r) =>
      r === UserRole.FACILITY_ADMIN || r === UserRole.MAINTENANCE,
    );

    const userIds = new Set<string>();

    if (globalRoles.length > 0) {
      const globals = await knex('users')
        .select('id')
        .whereIn('role', globalRoles)
        .where('is_active', true);
      globals.forEach((row: { id: string }) => userIds.add(row.id));
    }

    if (scopedRoles.length > 0) {
      const scoped = await knex('users as u')
        .distinct('u.id')
        .join('user_facility_associations as ufa', 'ufa.user_id', 'u.id')
        .where('ufa.facility_id', facilityId)
        .whereIn('u.role', scopedRoles)
        .where('u.is_active', true);
      scoped.forEach((row: { id: string }) => userIds.add(row.id));
    }

    const exclude = new Set(options?.excludeUserIds ?? []);
    return Array.from(userIds).filter((id) => !exclude.has(id));
  }

  /** Global platform operators (admin/dev_admin). */
  public async resolveGlobalOperators(): Promise<string[]> {
    const knex = this.db.connection;
    const rows = await knex('users')
      .select('id')
      .whereIn('role', GLOBAL_OPERATOR_ROLES)
      .where('is_active', true);
    return rows.map((row: { id: string }) => row.id);
  }
}
