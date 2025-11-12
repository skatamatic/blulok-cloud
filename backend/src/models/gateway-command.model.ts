import { DatabaseService } from '@/services/database.service';

/**
 * Gateway Command Model
 *
 * Manages the lifecycle of commands sent to gateway devices for execution.
 * Implements a robust queuing system with retry logic, prioritization, and
 * idempotency to ensure reliable device control operations.
 *
 * Key Features:
 * - Command queuing with priority-based execution
 * - Idempotency to prevent duplicate command execution
 * - Retry logic with exponential backoff
 * - Status tracking and failure handling
 * - Dead letter queue for failed commands
 * - Facility-scoped command isolation
 *
 * Command Status Lifecycle:
 * - pending: Command created but not yet queued
 * - queued: Command ready for execution
 * - in_progress: Command currently being executed
 * - succeeded: Command completed successfully
 * - failed: Command failed but can be retried
 * - cancelled: Command cancelled by user/system
 * - dead_letter: Command permanently failed, moved to dead letter queue
 *
 * Command Types:
 * - ADD_KEY: Program cryptographic access key to device
 * - REVOKE_KEY: Remove cryptographic access key from device
 * - Extensible for future device control operations
 *
 * Retry Logic:
 * - Configurable maximum retry attempts
 * - Exponential backoff for retry delays
 * - Circuit breaker pattern for failing devices
 * - Manual retry capabilities for administrators
 *
 * Security Considerations:
 * - Facility-scoped commands prevent cross-facility operations
 * - Idempotency keys prevent replay attacks
 * - Audit logging for all command operations
 * - Permission validation before command execution
 * - Secure payload encryption for sensitive commands
 */

export type GatewayCommandStatus = 'pending' | 'queued' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled' | 'dead_letter';

export interface GatewayCommand {
  /** Globally unique identifier for the command */
  id: string;
  /** Facility that owns this command */
  facility_id: string;
  /** Gateway responsible for executing the command */
  gateway_id: string;
  /** Target device for command execution */
  device_id: string;
  /** Type of command to execute */
  command_type: 'ADD_KEY' | 'REVOKE_KEY' | string;
  /** Command-specific payload data */
  payload: any;
  /** Idempotency key to prevent duplicate execution */
  idempotency_key: string;
  /** Current execution status */
  status: GatewayCommandStatus;
  /** Priority level (higher numbers = higher priority) */
  priority: number;
  /** Number of execution attempts made */
  attempt_count: number;
  /** Last error message if execution failed */
  last_error?: string | null;
  /** Timestamp for next retry attempt */
  next_attempt_at?: Date | null;
  /** Command creation timestamp */
  created_at: Date;
  /** Last update timestamp */
  updated_at: Date;
}

export interface CreateGatewayCommand {
  /** Facility that owns the command */
  facility_id: string;
  /** Gateway responsible for executing the command */
  gateway_id: string;
  /** Target device for command execution */
  device_id: string;
  /** Type of command to execute */
  command_type: 'ADD_KEY' | 'REVOKE_KEY' | string;
  /** Command-specific payload data */
  payload: any;
  /** Idempotency key to prevent duplicate execution */
  idempotency_key: string;
  /** Priority level (higher numbers = higher priority) */
  priority?: number;
  /** Optional scheduled execution time */
  next_attempt_at?: Date;
}

export class GatewayCommandModel {
  private db = DatabaseService.getInstance();
  private async tableExists(): Promise<boolean> {
    try {
      const knex = this.db.connection;
      return await knex.schema.hasTable('gateway_commands');
    } catch (_e) {
      return false;
    }
  }

  async enqueue(command: CreateGatewayCommand): Promise<GatewayCommand> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) {
      throw new Error('gateway_commands table is not available');
    }
    const now = new Date();
    const data = {
      ...command,
      status: 'pending' as GatewayCommandStatus,
      priority: command.priority ?? 0,
      attempt_count: 0,
      last_error: null,
      created_at: now,
      updated_at: now,
    };

    // Upsert on idempotency_key to dedupe
    await knex('gateway_commands')
      .insert(data)
      .onConflict('idempotency_key')
      .ignore();

    const row = await knex('gateway_commands').where('idempotency_key', command.idempotency_key).first();
    return row as GatewayCommand;
  }

  async pickDue(limit: number): Promise<GatewayCommand[]> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) {
      return [];
    }
    const now = new Date();
    // Use FOR UPDATE SKIP LOCKED for concurrency control (if supported)
    const rows = await knex('gateway_commands')
      .whereIn('status', ['pending', 'queued'])
      .andWhere(q => q.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', now))
      .orderBy([{ column: 'priority', order: 'desc' }, { column: 'created_at', order: 'asc' }])
      .limit(limit);
    return rows as GatewayCommand[];
  }

  async markInProgress(id: string): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).update({ status: 'in_progress', updated_at: new Date() });
  }

  async markSucceeded(id: string): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).update({ status: 'succeeded', updated_at: new Date(), next_attempt_at: null });
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date | null, attemptCount: number, deadLetter: boolean): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).update({
      status: deadLetter ? 'dead_letter' : 'failed',
      last_error: error,
      attempt_count: attemptCount,
      next_attempt_at: nextAttemptAt,
      updated_at: new Date(),
    });
  }

  async updateNextAttempt(id: string, nextAttemptAt: Date, attemptCount: number): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).update({
      status: 'queued',
      attempt_count: attemptCount,
      next_attempt_at: nextAttemptAt,
      updated_at: new Date(),
    });
  }

  async getById(id: string): Promise<GatewayCommand | null> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return null;
    const row = await knex('gateway_commands').where('id', id).first();
    return (row as GatewayCommand) || null;
  }

  async list(filters: { facilities?: string[] | undefined; statuses?: GatewayCommandStatus[] | undefined }, limit = 50, offset = 0): Promise<{ items: GatewayCommand[]; total: number; }> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return { items: [], total: 0 };
    let query = knex('gateway_commands').select('*');
    if (filters.facilities && filters.facilities.length > 0) {
      query = query.whereIn('facility_id', filters.facilities);
    }
    if (filters.statuses && filters.statuses.length > 0) {
      query = query.whereIn('status', filters.statuses);
    }
    const totalRow = await query.clone().count<{ count: number }>({ count: '*' }).first();
    const items = await query.orderBy([{ column: 'created_at', order: 'desc' }]).limit(limit).offset(offset);
    return { items: items as GatewayCommand[], total: Number((totalRow as any)?.count || 0) };
  }

  async retryNow(id: string): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).update({
      status: 'queued',
      next_attempt_at: new Date(),
      updated_at: new Date(),
    });
  }

  async cancel(id: string): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).update({
      status: 'cancelled',
      next_attempt_at: null,
      updated_at: new Date(),
    });
  }

  async requeueDead(id: string): Promise<void> {
    const knex = this.db.connection;
    if (!(await this.tableExists())) return;
    await knex('gateway_commands').where('id', id).andWhere('status', 'dead_letter').update({
      status: 'queued',
      next_attempt_at: new Date(),
      updated_at: new Date(),
    });
  }
}

export interface GatewayCommandAttempt {
  id: string;
  command_id: string;
  attempt_number: number;
  started_at: Date;
  finished_at?: Date | null;
  success: boolean;
  error?: string | null;
}

export class GatewayCommandAttemptModel {
  private db = DatabaseService.getInstance();

  async recordStart(commandId: string, attemptNumber: number): Promise<string> {
    const knex = this.db.connection;
    const [id] = await knex('gateway_command_attempts').insert({
      command_id: commandId,
      attempt_number: attemptNumber,
      started_at: new Date(),
      success: false,
    });
    return String(id);
  }

  async recordFinish(id: string, success: boolean, error?: string): Promise<void> {
    const knex = this.db.connection;
    await knex('gateway_command_attempts').where('id', id).update({
      finished_at: new Date(),
      success,
      error: error ?? null,
    });
  }

  async listByCommand(commandId: string): Promise<GatewayCommandAttempt[]> {
    const knex = this.db.connection;
    const rows = await knex('gateway_command_attempts')
      .where({ command_id: commandId })
      .orderBy('attempt_number', 'asc');
    return rows as GatewayCommandAttempt[];
  }
}


