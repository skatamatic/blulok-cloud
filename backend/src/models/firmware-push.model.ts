import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';
import { FirmwareTargetType } from './firmware.model';

/**
 * Firmware Push Status
 *
 * Represents the lifecycle states of a firmware push operation.
 */
export type FirmwarePushStatus = 'pending' | 'transferring' | 'verifying' | 'complete' | 'failed' | 'cancelled';

const TERMINAL_STATUSES: FirmwarePushStatus[] = ['complete', 'failed', 'cancelled'];

/**
 * Firmware Push Entity Interface
 *
 * Represents a firmware push task: the delivery of a firmware binary
 * from the cloud to a specific gateway. Persisted to the database to
 * enable stateful progress tracking across page navigations.
 *
 * target_type is denormalized from firmware_images for query convenience.
 * One active push is allowed per (gateway_id, target_type) combination,
 * so a gateway firmware push and a lock firmware push can run concurrently.
 */
export interface FirmwarePush {
  id: string;
  firmware_id: string;
  gateway_id: string;
  facility_id: string;
  target_type: FirmwareTargetType;
  status: FirmwarePushStatus;
  chunks_total: number | null;
  chunks_sent: number;
  progress_percent: number;
  phase?: string;
  devices_total?: number;
  devices_complete: number;
  devices_failed: number;
  error_message?: string;
  initiated_by: string;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFirmwarePushData {
  firmware_id: string;
  gateway_id: string;
  facility_id: string;
  target_type?: FirmwareTargetType;
  initiated_by: string;
  chunks_total?: number;
}

/**
 * FirmwarePushModel
 *
 * CRUD operations for the firmware_pushes table.
 * Tracks the lifecycle of firmware push operations for stateful progress.
 */
export class FirmwarePushModel {
  private db = DatabaseService.getInstance();

  async findById(id: string): Promise<FirmwarePush | null> {
    const knex = this.db.connection;
    const row = await knex('firmware_pushes').where('id', id).first();
    return row || null;
  }

  async findByGatewayId(gatewayId: string, targetType?: FirmwareTargetType, limit = 50, offset = 0): Promise<FirmwarePush[]> {
    const knex = this.db.connection;
    let query = knex('firmware_pushes')
      .where('gateway_id', gatewayId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (targetType) {
      query = query.where('target_type', targetType);
    }
    return await query;
  }

  async findActiveByGateway(gatewayId: string, targetType?: FirmwareTargetType): Promise<FirmwarePush | null> {
    const knex = this.db.connection;
    let query = knex('firmware_pushes')
      .where('gateway_id', gatewayId)
      .whereNotIn('status', TERMINAL_STATUSES)
      .orderBy('created_at', 'desc');
    if (targetType) {
      query = query.where('target_type', targetType);
    }
    return (await query.first()) || null;
  }

  async findLatestByGateway(gatewayId: string, targetType?: FirmwareTargetType): Promise<FirmwarePush | null> {
    const knex = this.db.connection;
    let query = knex('firmware_pushes')
      .where('gateway_id', gatewayId)
      .orderBy('created_at', 'desc');
    if (targetType) {
      query = query.where('target_type', targetType);
    }
    return (await query.first()) || null;
  }

  async create(data: CreateFirmwarePushData): Promise<FirmwarePush> {
    const knex = this.db.connection;
    const id = uuidv4();
    const now = new Date();
    await knex('firmware_pushes').insert({
      id,
      ...data,
      target_type: data.target_type || 'gateway',
      status: 'pending',
      chunks_sent: 0,
      created_at: now,
      updated_at: now,
    });
    return (await this.findById(id))!;
  }

  async updateProgress(id: string, chunksSent: number): Promise<void> {
    const knex = this.db.connection;
    await knex('firmware_pushes').where('id', id).update({
      chunks_sent: chunksSent,
      updated_at: new Date(),
    });
  }

  async updateStatus(id: string, status: FirmwarePushStatus, errorMessage?: string): Promise<void> {
    const knex = this.db.connection;
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };

    if (status === 'transferring' && !errorMessage) {
      update.started_at = new Date();
    }

    if (TERMINAL_STATUSES.includes(status)) {
      update.completed_at = new Date();
    }

    if (errorMessage !== undefined) {
      update.error_message = errorMessage;
    }

    await knex('firmware_pushes').where('id', id).update(update);
  }

  async updateChunksTotal(id: string, chunksTotal: number): Promise<void> {
    const knex = this.db.connection;
    await knex('firmware_pushes').where('id', id).update({
      chunks_total: chunksTotal,
      updated_at: new Date(),
    });
  }

  /**
   * Atomically cancel a push — only succeeds if status is still non-terminal.
   * Prevents TOCTOU race between checking status and setting it.
   * @returns true if the cancel was applied, false if the push was already terminal.
   */
  async atomicCancel(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const updated = await knex('firmware_pushes')
      .where('id', id)
      .whereNotIn('status', TERMINAL_STATUSES)
      .update({
        status: 'cancelled',
        completed_at: new Date(),
        updated_at: new Date(),
      });
    return updated > 0;
  }

  /**
   * Find the most recent push for a facility + target_type combination.
   * Used by handleUpdateStatus to correlate gateway reports to push records.
   */
  async findByFacilityAndTargetType(facilityId: string, targetType: FirmwareTargetType): Promise<FirmwarePush[]> {
    const knex = this.db.connection;
    return await knex('firmware_pushes')
      .where('facility_id', facilityId)
      .where('target_type', targetType)
      .orderBy('created_at', 'desc')
      .limit(1);
  }

  async updateProgressPercent(id: string, percent: number, phase?: string): Promise<void> {
    const knex = this.db.connection;
    const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
    const update: Record<string, unknown> = {
      progress_percent: clamped,
      updated_at: new Date(),
    };
    if (phase !== undefined) {
      update.phase = phase;
    }
    await knex('firmware_pushes').where('id', id).update(update);
  }

  async updateDeviceCounts(id: string, total: number | null, complete: number, failed: number): Promise<void> {
    const knex = this.db.connection;
    await knex('firmware_pushes').where('id', id).update({
      devices_total: total,
      devices_complete: complete,
      devices_failed: failed,
      updated_at: new Date(),
    });
  }

  /**
   * Find active (non-terminal) pushes scoped to a list of facility IDs.
   * Used to hydrate subscription initial data.
   */
  async findActiveByFacilities(facilityIds: string[]): Promise<FirmwarePush[]> {
    if (facilityIds.length === 0) return [];
    const knex = this.db.connection;
    return await knex('firmware_pushes')
      .whereIn('facility_id', facilityIds)
      .whereNotIn('status', TERMINAL_STATUSES)
      .orderBy('created_at', 'desc');
  }

  /**
   * Find all active (non-terminal) pushes system-wide.
   * Used for admin subscription hydration.
   */
  async findAllActive(): Promise<FirmwarePush[]> {
    const knex = this.db.connection;
    return await knex('firmware_pushes')
      .whereNotIn('status', TERMINAL_STATUSES)
      .orderBy('created_at', 'desc');
  }
}
