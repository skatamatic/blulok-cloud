import { DatabaseService } from '@/services/database.service';

export type AppPlatform = 'ios' | 'android' | 'web' | 'other';
export type UserDeviceStatus = 'pending_key' | 'active' | 'revoked';

export interface UserDevice {
  id: string;
  user_id: string;
  app_device_id: string;
  platform: AppPlatform;
  device_name?: string;
  public_key?: string; // base64 ed25519 public key
  status: UserDeviceStatus;
  last_used_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class UserDeviceModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  async findByUserAndAppDeviceId(userId: string, appDeviceId: string): Promise<UserDevice | undefined> {
    return this.db('user_devices')
      .where({ user_id: userId, app_device_id: appDeviceId })
      .first();
  }

  async listByUser(userId: string): Promise<UserDevice[]> {
    return this.db('user_devices').where({ user_id: userId }).orderBy('created_at', 'desc');
  }

  async countActiveByUser(userId: string): Promise<number> {
    const row = await this.db('user_devices')
      .where({ user_id: userId })
      .whereIn('status', ['pending_key', 'active'])
      .count('* as count')
      .first();
    return parseInt((row?.count as string) || '0', 10);
  }

  async create(data: Omit<UserDevice, 'id' | 'created_at' | 'updated_at'>): Promise<UserDevice> {
    const [created] = await this.db('user_devices')
      .insert({
        ...data,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .returning('*');
    return created as UserDevice;
  }

  async upsertByUserAndAppDeviceId(userId: string, appDeviceId: string, data: Partial<UserDevice>): Promise<UserDevice> {
    const existing = await this.findByUserAndAppDeviceId(userId, appDeviceId);
    if (existing) {
      const [updated] = await this.db('user_devices')
        .where({ id: existing.id })
        .update({ ...data, updated_at: this.db.fn.now() })
        .returning('*');
      return updated as UserDevice;
    }
    return this.create({
      user_id: userId,
      app_device_id: appDeviceId,
      platform: (data.platform as AppPlatform) || 'other',
      device_name: data.device_name,
      public_key: data.public_key,
      status: (data.status as UserDeviceStatus) || 'pending_key',
      last_used_at: data.last_used_at,
    } as any);
  }

  async updateById(id: string, data: Partial<UserDevice>): Promise<UserDevice | undefined> {
    const [updated] = await this.db('user_devices')
      .where({ id })
      .update({ ...data, updated_at: this.db.fn.now() })
      .returning('*');
    return updated as UserDevice | undefined;
  }

  async revoke(id: string): Promise<void> {
    await this.db('user_devices')
      .where({ id })
      .update({ status: 'revoked', updated_at: this.db.fn.now() });
  }
}


