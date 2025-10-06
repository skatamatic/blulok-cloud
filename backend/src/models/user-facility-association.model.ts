import { BaseModel } from './base.model';
import { ModelHooksService } from '../services/model-hooks.service';

export interface UserFacilityAssociation {
  id: string;
  user_id: string;
  facility_id: string;
  created_at: Date;
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
    const [id] = await this.query().insert({
      user_id: userId,
      facility_id: facilityId,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
    
    const association = await this.findById(String(id)) as UserFacilityAssociation;
    
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
