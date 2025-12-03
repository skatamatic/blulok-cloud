import { BaseModel } from './base.model';
import { ModelHooksService } from '../services/model-hooks.service';

/**
 * User Facility Association Model
 *
 * Manages the many-to-many relationship between users and facilities, controlling
 * which users have access to which facilities. This is a critical access control
 * mechanism that determines facility visibility and permissions throughout the system.
 *
 * Key Features:
 * - Many-to-many user-facility relationships
 * - Facility-scoped user access control
 * - Automatic association management
 * - Role-based permission inheritance
 * - Association lifecycle tracking
 *
 * Access Control:
 * - Users can only access facilities they're associated with
 * - Facility admins can manage user associations within their facility
 * - System admins can manage associations across all facilities
 * - Association changes trigger permission updates
 *
 * Association Types:
 * - Direct associations: Users explicitly assigned to facilities
 * - Role-based associations: Users gain access through their roles
 * - Temporary associations: Time-limited facility access
 * - Inherited associations: Through organizational hierarchies
 *
 * Security Considerations:
 * - Association validation before facility access
 * - Audit logging for all association changes
 * - Permission checks before association modifications
 * - Secure association queries with proper indexing
 * - Protection against association manipulation attacks
 */

export interface UserFacilityAssociation {
  /** Globally unique identifier for the association */
  id: string;
  /** User ID in the association */
  user_id: string;
  /** Facility ID in the association */
  facility_id: string;
  /** Association creation timestamp */
  created_at: Date;
  /** Association last update timestamp */
  updated_at: Date;
}

export class UserFacilityAssociationModel extends BaseModel {
  protected static override get tableName(): string {
    return 'user_facility_associations';
  }

  private static get hooks() {
    return ModelHooksService.getInstance();
  }

  public static async findByUserId(userId: string): Promise<UserFacilityAssociation[]> {
    return this.query().where('user_id', userId) as Promise<UserFacilityAssociation[]>;
  }

  public static async findByFacilityId(facilityId: string): Promise<UserFacilityAssociation[]> {
    return this.query().where('facility_id', facilityId) as Promise<UserFacilityAssociation[]>;
  }

  public static async getUserFacilityIds(userId: string): Promise<string[]> {
    const associations = await this.query()
      .select('facility_id')
      .where('user_id', userId) as { facility_id: string }[];
    
    return associations.map(assoc => assoc.facility_id);
  }

  public static async getFacilityUserIds(facilityId: string): Promise<string[]> {
    const associations = await this.query()
      .select('user_id')
      .where('facility_id', facilityId) as { user_id: string }[];
    
    return associations.map(assoc => assoc.user_id);
  }

  public static async addUserToFacility(userId: string, facilityId: string): Promise<UserFacilityAssociation> {
    await this.query().insert({
      user_id: userId,
      facility_id: facilityId,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
    
    // MySQL does not reliably return inserted IDs for tables without auto-increment;
    // fetch the created association by natural key instead.
    const association = await this.query()
      .where('user_id', userId)
      .where('facility_id', facilityId)
      .first() as UserFacilityAssociation | undefined;

    if (!association) {
      throw new Error('Failed to create user-facility association');
    }
    
    // If user is a tenant, assign default schedule for this facility
    try {
      const { UserModel } = await import('@/models/user.model');
      const user = await UserModel.findById(userId);
      if (user && (user as any).role === 'tenant') {
        const { SchedulesService } = await import('@/services/schedules.service');
        const { UserFacilityScheduleModel } = await import('@/models/user-facility-schedule.model');
        
        // Get default tenant schedule for this facility
        const { ScheduleModel } = await import('@/models/schedule.model');
        const schedules = await ScheduleModel.findByFacility(facilityId, {
          schedule_type: 'precanned',
          is_active: true,
        });
        
        const defaultSchedule = schedules.find(s => s.name === 'Default Tenant Schedule');
        if (defaultSchedule) {
          await UserFacilityScheduleModel.setUserSchedule(userId, facilityId, defaultSchedule.id, null);
        }
      }
    } catch (error) {
      // Log but don't fail association creation if schedule assignment fails
      const { logger } = await import('@/utils/logger');
      logger.error(`Failed to assign default schedule to tenant ${userId} for facility ${facilityId}:`, error);
    }
    
    // Trigger model change hook
    await this.hooks.onUserFacilityAssociationChange('create', association.id, association);
    
    return association;
  }

  public static async removeUserFromFacility(userId: string, facilityId: string): Promise<number> {
    const deleted = await this.query()
      .where('user_id', userId)
      .where('facility_id', facilityId)
      .del();
    
    // Trigger model change hook
    if (deleted > 0) {
      await this.hooks.onUserFacilityAssociationChange('delete', `${userId}-${facilityId}`);
    }
    
    return deleted;
  }

  public static async setUserFacilities(userId: string, facilityIds: string[]): Promise<void> {
    // Remove existing associations
    await this.query().where('user_id', userId).del();
    
    // Add new associations
    if (facilityIds.length > 0) {
      const associations = facilityIds.map(facilityId => ({
        user_id: userId,
        facility_id: facilityId,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      }));
      
      await this.query().insert(associations);
    }
    
    // Trigger model change hook for bulk update
    await this.hooks.onUserFacilityAssociationChange('update', userId, { facilityIds });
  }

  public static async getUsersWithFacilities(): Promise<any[]> {
    return this.query()
      .select(
        'users.id',
        'users.email',
        'users.first_name',
        'users.last_name',
        'users.role',
        'users.is_active',
        'users.last_login',
        'users.created_at',
        'users.updated_at',
        this.db.raw('GROUP_CONCAT(facilities.name) as facility_names'),
        this.db.raw('GROUP_CONCAT(facilities.id) as facility_ids')
      )
      .leftJoin('user_facility_associations', 'users.id', 'user_facility_associations.user_id')
      .leftJoin('facilities', 'user_facility_associations.facility_id', 'facilities.id')
      .groupBy('users.id')
      .from('users');
  }

  public static async hasAccessToFacility(userId: string, facilityId: string): Promise<boolean> {
    const association = await this.query()
      .where('user_id', userId)
      .where('facility_id', facilityId)
      .first();
    
    return !!association;
  }
}
