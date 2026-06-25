import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

export type GatewayRecoveryStatus =
  | 'detected'
  | 'awaiting_config'
  | 'firmware'
  | 'inventory_push'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'bypassed';

export const TERMINAL_RECOVERY_STATUSES: GatewayRecoveryStatus[] = [
  'complete',
  'failed',
  'cancelled',
  'bypassed',
];

export const BLOCKING_RECOVERY_STATUSES: GatewayRecoveryStatus[] = [
  'detected',
  'awaiting_config',
  'firmware',
  'inventory_push',
];

export interface GatewayRecovery {
  id: string;
  facility_id: string;
  gateway_id: string;
  previous_gateway_id: string | null;
  status: GatewayRecoveryStatus;
  firmware_id: string | null;
  inventory_snapshot_id: string | null;
  firmware_push_id: string | null;
  inventory_chunks_total: number | null;
  inventory_chunks_sent: number;
  inventory_nonce: string | null;
  bypassed: boolean;
  error_message: string | null;
  initiated_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGatewayRecoveryData {
  facility_id: string;
  gateway_id: string;
  previous_gateway_id?: string | null;
  status?: GatewayRecoveryStatus;
  initiated_by?: string | null;
}

export interface CreateIfNoActiveRecoveryResult {
  recovery: GatewayRecovery | null;
  existingRecovery: GatewayRecovery | null;
}

export class GatewayRecoveryModel {
  private db = DatabaseService.getInstance();

  async findById(id: string): Promise<GatewayRecovery | null> {
    const row = await this.db.connection('gateway_recoveries').where('id', id).first();
    return row || null;
  }

  async findActiveByFacility(facilityId: string): Promise<GatewayRecovery | null> {
    return (
      (await this.db.connection('gateway_recoveries')
        .where('facility_id', facilityId)
        .whereNotIn('status', TERMINAL_RECOVERY_STATUSES)
        .orderBy('created_at', 'desc')
        .first()) || null
    );
  }

  async findLatestByFacility(facilityId: string): Promise<GatewayRecovery | null> {
    return (
      (await this.db.connection('gateway_recoveries')
        .where('facility_id', facilityId)
        .orderBy('created_at', 'desc')
        .first()) || null
    );
  }

  async findLatestByGateway(gatewayId: string): Promise<GatewayRecovery | null> {
    return (
      (await this.db.connection('gateway_recoveries')
        .where('gateway_id', gatewayId)
        .orderBy('created_at', 'desc')
        .first()) || null
    );
  }

  async findAllActive(): Promise<GatewayRecovery[]> {
    return this.db.connection('gateway_recoveries')
      .whereNotIn('status', TERMINAL_RECOVERY_STATUSES)
      .orderBy('created_at', 'desc');
  }

  async createIfNoActive(data: CreateGatewayRecoveryData): Promise<CreateIfNoActiveRecoveryResult> {
    const knex = this.db.connection;
    return knex.transaction(async (trx) => {
      await trx('gateways').where('facility_id', data.facility_id).forUpdate();
      const existing = await trx('gateway_recoveries')
        .where('facility_id', data.facility_id)
        .whereNotIn('status', TERMINAL_RECOVERY_STATUSES)
        .orderBy('created_at', 'desc')
        .first();
      if (existing) {
        return { recovery: null, existingRecovery: existing };
      }
      const id = uuidv4();
      const now = new Date();
      await trx('gateway_recoveries').insert({
        id,
        facility_id: data.facility_id,
        gateway_id: data.gateway_id,
        previous_gateway_id: data.previous_gateway_id ?? null,
        status: data.status ?? 'detected',
        initiated_by: data.initiated_by ?? null,
        started_at: now,
        active_facility_key: data.facility_id,
        created_at: now,
        updated_at: now,
      });
      const recovery = await trx('gateway_recoveries').where('id', id).first();
      return { recovery, existingRecovery: null };
    });
  }

  async updateStatus(
    id: string,
    status: GatewayRecoveryStatus,
    errorMessage?: string,
  ): Promise<void> {
    const existing = await this.db.connection('gateway_recoveries').where('id', id).select('facility_id').first();
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (errorMessage !== undefined) {
      patch.error_message = errorMessage;
    }
    if (TERMINAL_RECOVERY_STATUSES.includes(status)) {
      patch.completed_at = new Date();
      patch.active_facility_key = null;
    } else if (existing?.facility_id) {
      patch.active_facility_key = existing.facility_id;
    }
    if (status === 'bypassed') {
      patch.bypassed = true;
    }
    await this.db.connection('gateway_recoveries').where('id', id).update(patch);
  }

  async updateFields(id: string, fields: Partial<Omit<GatewayRecovery, 'id' | 'created_at'>>): Promise<void> {
    const patch: Record<string, unknown> = { ...fields, updated_at: new Date() };
    if (fields.status && TERMINAL_RECOVERY_STATUSES.includes(fields.status)) {
      patch.active_facility_key = null;
    }
    await this.db.connection('gateway_recoveries')
      .where('id', id)
      .update(patch);
  }

  async updateActiveGatewayId(
    facilityId: string,
    recoveryId: string,
    gatewayId: string,
  ): Promise<GatewayRecovery | null> {
    const updated = await this.db.connection('gateway_recoveries')
      .where('id', recoveryId)
      .where('facility_id', facilityId)
      .whereNotIn('status', TERMINAL_RECOVERY_STATUSES)
      .update({ gateway_id: gatewayId, updated_at: new Date() });
    if (updated === 0) return null;
    return this.findById(recoveryId);
  }

  async updateInventoryProgress(id: string, chunksSent: number, chunksTotal?: number): Promise<void> {
    const patch: Record<string, unknown> = {
      inventory_chunks_sent: chunksSent,
      updated_at: new Date(),
    };
    if (chunksTotal !== undefined) {
      patch.inventory_chunks_total = chunksTotal;
    }
    await this.db.connection('gateway_recoveries').where('id', id).update(patch);
  }

  async atomicCancel(id: string): Promise<boolean> {
    const updated = await this.db.connection('gateway_recoveries')
      .where('id', id)
      .whereNotIn('status', TERMINAL_RECOVERY_STATUSES)
      .update({
        status: 'cancelled',
        completed_at: new Date(),
        active_facility_key: null,
        updated_at: new Date(),
      });
    return updated > 0;
  }
}

export class GatewayRecoveryEventModel {
  private db = DatabaseService.getInstance();

  async append(
    recoveryId: string,
    phase: string,
    message?: string,
    progressPercent?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.connection('gateway_recovery_events').insert({
      id: uuidv4(),
      recovery_id: recoveryId,
      phase,
      message: message ?? null,
      progress_percent: progressPercent ?? null,
      metadata: metadata ?? null,
      created_at: new Date(),
    });
  }

  async findByRecoveryId(recoveryId: string, limit = 100): Promise<Array<{
    id: string;
    recovery_id: string;
    phase: string;
    message: string | null;
    progress_percent: number | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>> {
    const rows = await this.db.connection('gateway_recovery_events')
      .where('recovery_id', recoveryId)
      .orderBy('created_at', 'asc')
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }));
  }
}

export class GatewayInventorySnapshotModel {
  private db = DatabaseService.getInstance();

  async findById(id: string): Promise<{
    id: string;
    gateway_id: string;
    facility_id: string;
    sha256_hash: string;
    size_bytes: number;
    storage_path: string;
    device_count: number;
    created_at: Date;
  } | null> {
    const row = await this.db.connection('gateway_inventory_snapshots').where('id', id).first();
    return row || null;
  }

  async create(data: {
    id?: string;
    gateway_id: string;
    facility_id: string;
    sha256_hash: string;
    size_bytes: number;
    storage_path: string;
    device_count: number;
  }): Promise<{ id: string } & Omit<typeof data, 'id'> & { created_at: Date }> {
    const id = data.id || uuidv4();
    const now = new Date();
    await this.db.connection('gateway_inventory_snapshots').insert({
      id,
      ...data,
      created_at: now,
    });
    return { id, ...data, created_at: now };
  }
}
