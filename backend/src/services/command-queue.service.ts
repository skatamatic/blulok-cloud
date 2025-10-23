import { GatewayCommandModel, GatewayCommand, CreateGatewayCommand } from '@/models/gateway-command.model';

function computeIdempotencyKey(deviceId: string, commandType: string, payload: any): string {
  // Normalize key identity fields
  const keyIdentifier = payload?.public_key || payload?.key_code || payload?.keyCode || payload?.key_token || 'unknown';
  return `${deviceId}:${commandType}:${String(keyIdentifier)}`;
}

export class CommandQueueService {
  private static instance: CommandQueueService;
  private model: GatewayCommandModel;

  private constructor() {
    this.model = new GatewayCommandModel();
  }

  public static getInstance(): CommandQueueService {
    if (!CommandQueueService.instance) {
      CommandQueueService.instance = new CommandQueueService();
    }
    return CommandQueueService.instance;
  }

  public async enqueue(command: Omit<CreateGatewayCommand, 'idempotency_key'>): Promise<GatewayCommand> {
    const idempotency_key = computeIdempotencyKey(command.device_id, command.command_type, command.payload);
    const row = await this.model.enqueue({ ...command, idempotency_key });
    try {
      const { WebSocketService } = await import('@/services/websocket.service');
      await WebSocketService.getInstance().broadcastCommandQueueUpdate();
    } catch (_e) {}
    return row;
  }
}


