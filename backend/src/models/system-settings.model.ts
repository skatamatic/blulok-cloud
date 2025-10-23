import { DatabaseService } from '@/services/database.service';

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export class SystemSettingsModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  async get(key: string): Promise<string | undefined> {
    const row = await this.db('system_settings').where({ key }).first();
    return row?.value;
  }

  async set(key: string, value: string): Promise<void> {
    const row = await this.db('system_settings').where({ key }).first();
    if (row) {
      await this.db('system_settings').where({ key }).update({ value, updated_at: this.db.fn.now() });
    } else {
      await this.db('system_settings').insert({ key, value, created_at: this.db.fn.now(), updated_at: this.db.fn.now() });
    }
  }
}


