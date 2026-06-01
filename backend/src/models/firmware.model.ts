import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Firmware target type — describes what hardware the firmware binary is for.
 *
 * - gateway: applied to the gateway itself
 * - lock: broadcast to all BluLok locks on the gateway's BLE network
 * - friend_node: broadcast to all friend nodes (BLE mesh relays)
 * - access_control: applied to access control devices
 */
export type FirmwareTargetType = 'gateway' | 'lock' | 'friend_node' | 'access_control';

/**
 * Firmware Image Entity Interface
 *
 * Represents an uploaded firmware binary in the catalog.
 * Managed by DEV_ADMIN through the DevTools Firmware Management tab.
 */
export interface FirmwareImage {
  id: string;
  version: string;
  target_type: FirmwareTargetType;
  filename: string;
  sha256_hash: string;
  size_bytes: number;
  description?: string;
  release_notes?: string;
  compatible_models?: string[];
  minimum_version?: string;
  storage_path: string;
  uploaded_by: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFirmwareImageData {
  id?: string;
  version: string;
  target_type?: FirmwareTargetType;
  filename: string;
  sha256_hash: string;
  size_bytes: number;
  description?: string;
  release_notes?: string;
  compatible_models?: string[];
  minimum_version?: string;
  storage_path: string;
  uploaded_by: string;
}

/**
 * FirmwareModel
 *
 * CRUD operations for the firmware_images table.
 * Follows the same pattern as GatewayModel.
 */
export class FirmwareModel {
  private db = DatabaseService.getInstance();

  async findAll(activeOnly = true, targetType?: FirmwareTargetType): Promise<FirmwareImage[]> {
    const knex = this.db.connection;
    let query = knex('firmware_images').select('*').orderBy('created_at', 'desc');
    if (activeOnly) {
      query = query.where('is_active', true);
    }
    if (targetType) {
      query = query.where('target_type', targetType);
    }
    const rows = await query;
    return rows.map(this.deserialize);
  }

  async findById(id: string): Promise<FirmwareImage | null> {
    const knex = this.db.connection;
    const row = await knex('firmware_images').where('id', id).first();
    return row ? this.deserialize(row) : null;
  }

  async findByVersion(version: string, targetType: FirmwareTargetType = 'gateway'): Promise<FirmwareImage | null> {
    const knex = this.db.connection;
    const row = await knex('firmware_images')
      .where('version', version)
      .where('target_type', targetType)
      .first();
    return row ? this.deserialize(row) : null;
  }

  async findActive(targetType?: FirmwareTargetType): Promise<FirmwareImage[]> {
    return this.findAll(true, targetType);
  }

  async create(data: CreateFirmwareImageData): Promise<FirmwareImage> {
    const knex = this.db.connection;
    const id = data.id || uuidv4();
    const now = new Date();
    const { id: _ignoredId, ...insertData } = data;
    await knex('firmware_images').insert({
      id,
      ...insertData,
      target_type: data.target_type || 'gateway',
      compatible_models: data.compatible_models ? JSON.stringify(data.compatible_models) : null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    return (await this.findById(id))!;
  }

  async softDelete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const updated = await knex('firmware_images').where('id', id).update({
      is_active: false,
      updated_at: new Date(),
    });
    return updated > 0;
  }

  private deserialize(row: any): FirmwareImage {
    return {
      ...row,
      compatible_models: typeof row.compatible_models === 'string'
        ? JSON.parse(row.compatible_models)
        : row.compatible_models || null,
      is_active: Boolean(row.is_active),
    };
  }
}
