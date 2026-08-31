import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';

export interface AccessEventScope {
  allowedFacilityIds?: string[];
  allowedUnitIds?: string[];
  ownUserId?: string;
}

export class AccessEventScopeService {
  private get db() {
    return DatabaseService.getInstance().connection;
  }

  public async buildScope(userId: string, role: UserRole, facilityIds?: string[]): Promise<AccessEventScope> {
    if (AuthService.canAccessAllFacilities(role)) {
      return {};
    }

    if (AuthService.isFacilityAdmin(role)) {
      return { allowedFacilityIds: facilityIds || [] };
    }

    if (role === UserRole.TENANT) {
      const allowedUnitIds = await this.getTenantAccessibleUnitIds(userId);
      return { allowedUnitIds, ownUserId: userId };
    }

    if (role === UserRole.MAINTENANCE) {
      return { ownUserId: userId };
    }

    return { ownUserId: userId };
  }

  public async getTenantAccessibleUnitIds(userId: string): Promise<string[]> {
    const [assignedRows, sharedRows] = await Promise.all([
      this.db('unit_assignments')
        .select('unit_id')
        .where({ tenant_id: userId }),
      this.db('key_sharing')
        .select('unit_id')
        .where({ shared_with_user_id: userId, is_active: true })
        .where((qb) => {
          qb.whereNull('expires_at').orWhere('expires_at', '>', this.db.fn.now());
        }),
    ]);

    const unitIdSet = new Set<string>();
    for (const row of assignedRows) {
      if (typeof row.unit_id === 'string') {
        unitIdSet.add(row.unit_id);
      }
    }
    for (const row of sharedRows) {
      if (typeof row.unit_id === 'string') {
        unitIdSet.add(row.unit_id);
      }
    }

    return Array.from(unitIdSet);
  }
}
