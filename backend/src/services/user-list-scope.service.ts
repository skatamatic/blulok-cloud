import { User, UserModel } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { AuthService } from '@/services/auth.service';
import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';
import { isUserVisibleToFacilityAdmin } from '@/utils/users-rbac.util';

/**
 * Resolves which user IDs a tenant/maintenance caller may see beyond themselves
 * (recipients of active key shares they granted as primary tenant).
 */
export class UserListScopeService {
  public static async getSharedAccessRecipientUserIds(grantingUserId: string): Promise<Set<string>> {
    const knex = DatabaseService.getInstance().connection;
    const rows = (await knex('key_sharing')
      .distinct('shared_with_user_id')
      .where('primary_tenant_id', grantingUserId)
      .where('is_active', true)
      .where(function activeShare() {
        this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
      })) as Array<{ shared_with_user_id: string }>;

    return new Set(rows.map((row) => row.shared_with_user_id));
  }

  public static async canRequesterViewUser(
    requesterId: string,
    requesterRole: UserRole,
    targetUserId: string,
    requesterFacilityIds: string[] = []
  ): Promise<boolean> {
    if (requesterId === targetUserId) {
      return true;
    }

    if (AuthService.canAccessAllFacilities(requesterRole)) {
      return true;
    }

    if (requesterRole === UserRole.FACILITY_ADMIN) {
      if (requesterFacilityIds.length === 0) {
        return false;
      }

      const targetUser = (await UserModel.findById(targetUserId)) as User | undefined;
      if (!targetUser) {
        return false;
      }

      const targetFacilities = await UserFacilityAssociationModel.getUserFacilityIds(targetUserId);
      return isUserVisibleToFacilityAdmin(
        {
          id: targetUser.id,
          role: targetUser.role,
          facility_ids: targetFacilities.join(','),
        },
        requesterFacilityIds
      );
    }

    if (requesterRole === UserRole.TENANT || requesterRole === UserRole.MAINTENANCE) {
      const sharedRecipients = await this.getSharedAccessRecipientUserIds(requesterId);
      return sharedRecipients.has(targetUserId);
    }

    return false;
  }
}
