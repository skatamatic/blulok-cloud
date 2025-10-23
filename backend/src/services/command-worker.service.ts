import { GatewayCommandModel, GatewayCommandAttemptModel, GatewayCommand } from '@/models/gateway-command.model';
import { GatewayService } from '@/services/gateway/gateway.service';

function backoff(attempt: number): number {
  // No max attempts; exponential with cap 1h, add jitter
  const base = Math.min(60 * 60, Math.pow(3, Math.max(0, attempt - 1)) * 5); // seconds
  const jitter = Math.floor(Math.random() * Math.min(300, base * 0.1));
  return (base + jitter) * 1000;
}

export class CommandWorkerService {
  private static instance: CommandWorkerService;
  private running = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private commandModel = new GatewayCommandModel();
  private attemptModel = new GatewayCommandAttemptModel();

  private constructor() {}

  public static getInstance(): CommandWorkerService {
    if (!CommandWorkerService.instance) {
      CommandWorkerService.instance = new CommandWorkerService();
    }
    return CommandWorkerService.instance;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => {
      this.tick().catch(err => console.error('CommandWorker tick error:', err));
    }, 2000);
    console.log('CommandWorker started');
  }

  public stop(): void {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async tick(): Promise<void> {
    const due = await this.commandModel.pickDue(25);
    for (const cmd of due) {
      await this.processOne(cmd);
    }
  }

  private async processOne(cmd: GatewayCommand): Promise<void> {
    try {
      await this.commandModel.markInProgress(cmd.id);
      const attemptNumber = cmd.attempt_count + 1;
      const attemptId = await this.attemptModel.recordStart(cmd.id, attemptNumber);

      const gatewayService = GatewayService.getInstance();
      const gateway = gatewayService.getGateway(cmd.gateway_id);
      if (!gateway) {
        throw new Error('Gateway not initialized');
      }

      // Execute by command type
      if (cmd.command_type === 'ADD_KEY') {
        const deviceId = cmd.device_id;
        const payload = cmd.payload;
        const res = await (gateway as any).addKey(deviceId, payload);
        if (!res?.success) throw new Error(res?.error || 'ADD_KEY failed');

        // If v1 and keyCode returned, persist it on device_key_distributions
        const keyCode = res?.data?.keyCode;
        const db = (await import('@/services/database.service')).DatabaseService.getInstance().connection;
        const userDeviceId = payload?.user_device_id;
        // Mark added and persist keyCode if present
        const q = db('device_key_distributions')
          .where({ target_type: 'blulok', target_id: deviceId })
          .whereIn('status', ['pending_add']);
        if (userDeviceId) q.andWhere('user_device_id', userDeviceId);
        const updateData: any = { status: 'added', updated_at: db.fn.now() };
        if (typeof res?.data?.keyCode === 'number') updateData.key_code = res.data.keyCode;
        await q.update(updateData);

        // Auto-activate device if applicable
        if (userDeviceId) {
          const { KeyDistributionService } = await import('@/services/key-distribution.service');
          await KeyDistributionService.getInstance().checkAndActivateUserDevice(userDeviceId);
        }
      } else if (cmd.command_type === 'REVOKE_KEY') {
        const deviceId = cmd.device_id;
        const keyCode = cmd.payload?.key_code ?? cmd.payload?.keyCode;
        const publicKey = cmd.payload?.public_key;
        const res = await (gateway as any).revokeKey(deviceId, keyCode, publicKey);
        if (!res?.success) throw new Error(res?.error || 'REVOKE_KEY failed');

        // Mark distribution removed
        const db = (await import('@/services/database.service')).DatabaseService.getInstance().connection;
        const userDeviceId = cmd.payload?.user_device_id;
        const q2 = db('device_key_distributions')
          .where({ target_type: 'blulok', target_id: deviceId })
          .whereIn('status', ['pending_remove']);
        if (userDeviceId) q2.andWhere('user_device_id', userDeviceId);
        await q2.update({ status: 'removed', updated_at: db.fn.now() });
        // Optional: if no more added for the device, keep status as is (do not deactivate automatically)
      } else {
        throw new Error(`Unsupported command_type: ${cmd.command_type}`);
      }

      await this.attemptModel.recordFinish(attemptId, true);
      await this.commandModel.markSucceeded(cmd.id);
      try {
        const { WebSocketService } = await import('@/services/websocket.service');
        await WebSocketService.getInstance().broadcastCommandQueueUpdate();
      } catch (_e) {}
    } catch (error: any) {
      const message = error?.message || String(error);
      const nextDelay = backoff(cmd.attempt_count + 1);
      const nextAttemptAt = new Date(Date.now() + nextDelay);
      const deadLetter = false; // Never auto-stop; admin can cancel
      await this.commandModel.markFailed(cmd.id, message, nextAttemptAt, cmd.attempt_count + 1, deadLetter);
      try {
        const { WebSocketService } = await import('@/services/websocket.service');
        await WebSocketService.getInstance().broadcastCommandQueueUpdate();
      } catch (_e) {}
    }
  }
}


