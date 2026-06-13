import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

export type ProvisioningRestoreStatus =
  | 'pending'
  | 'transferring'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'cancelled';

const TERMINAL_STATUSES: ProvisioningRestoreStatus[] = ['complete', 'failed', 'cancelled'];

export interface GatewayProvisioningRestore {
  id: string;
  backup_id: string;
  gateway_id: string;
  facility_id: string;
  status: ProvisioningRestoreStatus;
  chunks_total: number | null;
  chunks_sent: number;
  nonce: string | null;
  error_message: string | null;
  initiated_by: string;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProvisioningRestoreData {
  backup_id: string;
  gateway_id: string;
  facility_id: string;
  initiated_by: string;
  chunks_total?: number;
  nonce?: string;
}

export interface CreateIfNoActiveRestoreResult {
  restore: GatewayProvisioningRestore | null;
  existingRestore: GatewayProvisioningRestore | null;
}

export class GatewayProvisioningRestoreModel {
  private db = DatabaseService.getInstance();

  async findById(id: string): Promise<GatewayProvisioningRestore | null> {
    const row = await this.db.connection('gateway_provisioning_restores').where('id', id).first();
    return row || null;
  }

  async findActiveByGateway(gatewayId: string): Promise<GatewayProvisioningRestore | null> {
    return (
      (await this.db.connection('gateway_provisioning_restores')
        .where('gateway_id', gatewayId)
        .whereNotIn('status', TERMINAL_STATUSES)
        .orderBy('created_at', 'desc')
        .first()) || null
    );
  }

  async findByGatewayId(gatewayId: string, limit = 20, offset = 0): Promise<GatewayProvisioningRestore[]> {
    return this.db.connection('gateway_provisioning_restores')
      .where('gateway_id', gatewayId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async createIfNoActive(data: CreateProvisioningRestoreData): Promise<CreateIfNoActiveRestoreResult> {
    const knex = this.db.connection;
    return knex.transaction(async (trx) => {
      await trx('gateways').where('id', data.gateway_id).forUpdate();
      const existing = await trx('gateway_provisioning_restores')
        .where('gateway_id', data.gateway_id)
        .whereNotIn('status', TERMINAL_STATUSES)
        .orderBy('created_at', 'desc')
        .first();
      if (existing) {
        return { restore: null, existingRestore: existing };
      }
      const id = uuidv4();
      const now = new Date();
      await trx('gateway_provisioning_restores').insert({
        id,
        backup_id: data.backup_id,
        gateway_id: data.gateway_id,
        facility_id: data.facility_id,
        status: 'pending',
        chunks_total: data.chunks_total ?? null,
        chunks_sent: 0,
        nonce: data.nonce ?? null,
        initiated_by: data.initiated_by,
        started_at: now,
        created_at: now,
        updated_at: now,
      });
      const restore = await trx('gateway_provisioning_restores').where('id', id).first();
      return { restore, existingRestore: null };
    });
  }

  async updateStatus(
    id: string,
    status: ProvisioningRestoreStatus,
    errorMessage?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (errorMessage !== undefined) {
      patch.error_message = errorMessage;
    }
    if (TERMINAL_STATUSES.includes(status)) {
      patch.completed_at = new Date();
    }
    await this.db.connection('gateway_provisioning_restores').where('id', id).update(patch);
  }

  async updateProgress(id: string, chunksSent: number): Promise<void> {
    await this.db.connection('gateway_provisioning_restores')
      .where('id', id)
      .update({ chunks_sent: chunksSent, updated_at: new Date() });
  }

  async updateChunksTotal(id: string, chunksTotal: number): Promise<void> {
    await this.db.connection('gateway_provisioning_restores')
      .where('id', id)
      .update({ chunks_total: chunksTotal, updated_at: new Date() });
  }

  async findActiveByFacility(facilityId: string): Promise<GatewayProvisioningRestore[]> {
    return this.db.connection('gateway_provisioning_restores')
      .where('facility_id', facilityId)
      .whereNotIn('status', TERMINAL_STATUSES)
      .orderBy('created_at', 'desc');
  }

  async findAllActive(): Promise<GatewayProvisioningRestore[]> {
    return this.db.connection('gateway_provisioning_restores')
      .whereNotIn('status', TERMINAL_STATUSES)
      .orderBy('created_at', 'desc');
  }

  async atomicCancel(id: string): Promise<boolean> {
    const updated = await this.db.connection('gateway_provisioning_restores')
      .where('id', id)
      .whereNotIn('status', TERMINAL_STATUSES)
      .update({
        status: 'cancelled',
        completed_at: new Date(),
        updated_at: new Date(),
      });
    return updated > 0;
  }

  async atomicFailIfActive(id: string, errorMessage: string): Promise<boolean> {
    const updated = await this.db.connection('gateway_provisioning_restores')
      .where('id', id)
      .whereNotIn('status', TERMINAL_STATUSES)
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date(),
        updated_at: new Date(),
      });
    return updated > 0;
  }
}

export class GatewayProvisioningRestoreEventModel {
  private db = DatabaseService.getInstance();

  async append(restoreId: string, eventType: string, message?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.db.connection('gateway_provisioning_restore_events').insert({
      id: uuidv4(),
      restore_id: restoreId,
      event_type: eventType,
      message: message ?? null,
      metadata: metadata ?? null,
      created_at: new Date(),
    });
  }

  async findByRestoreId(restoreId: string, limit = 100): Promise<Array<{
    id: string;
    restore_id: string;
    event_type: string;
    message: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>> {
    const rows = await this.db.connection('gateway_provisioning_restore_events')
      .where('restore_id', restoreId)
      .orderBy('created_at', 'asc')
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }));
  }
}
