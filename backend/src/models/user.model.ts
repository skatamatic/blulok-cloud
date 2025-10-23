import { BaseModel } from './base.model';
import { UserRole } from '@/types/auth.types';
import { ModelHooksService } from '../services/model-hooks.service';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export class UserModel extends BaseModel {
  protected static override get tableName(): string {
    return 'users';
  }

  // Backwards-compat for older tests expecting update/deactivate
  public static async update(id: string, data: Partial<User>): Promise<User | undefined> {
    const updated = await this.updateById(id, data as Record<string, unknown>);
    return updated as User | undefined;
  }

  public static async deactivate(id: string, _performedBy?: string, _reason?: string): Promise<void> {
    await this.query()
      .where('id', id)
      .update({ is_active: false, updated_at: this.db.fn.now() });
    const user = await this.findById(id) as User | undefined;
    if (user) {
      await this.hooks.onUserChange('status_change', user.id, user);
    }
  }

  private static get hooks() {
    return ModelHooksService.getInstance();
  }

  public static async findByEmail(email: string): Promise<User | undefined> {
    return this.query().where('email', email).first() as Promise<User | undefined>;
  }

  public static async findActiveUsers(): Promise<User[]> {
    return this.query().where('is_active', true) as Promise<User[]>;
  }

  public static async findByRole(role: UserRole): Promise<User[]> {
    return this.query().where('role', role) as Promise<User[]>;
  }

  public static async updateLastLogin(id: string): Promise<void> {
    await this.query()
      .where('id', id)
      .update({
        last_login: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  public static async deactivateUser(id: string): Promise<User | undefined> {
    await this.query()
      .where('id', id)
      .update({
        is_active: false,
        updated_at: this.db.fn.now(),
      });
    
    const user = await this.findById(id) as User | undefined;
    
    // Trigger model change hook
    if (user) {
      await this.hooks.onUserChange('status_change', user.id, user);
    }
    
    return user;
  }

  public static async activateUser(id: string): Promise<User | undefined> {
    await this.query()
      .where('id', id)
      .update({
        is_active: true,
        updated_at: this.db.fn.now(),
      });
    
    const user = await this.findById(id) as User | undefined;
    
    // Trigger model change hook
    if (user) {
      await this.hooks.onUserChange('status_change', user.id, user);
    }
    
    return user;
  }
}
