import type { GatewayWsMessage } from '@protocol/messages';

export type TransportEventHandler = (message: unknown) => void;
export type TransportCloseHandler = (code: number, reason: string) => void;

export interface ITransport {
  connect(): Promise<void>;
  disconnect(): void;
  send(message: GatewayWsMessage | Record<string, unknown>): void;
  isConnected(): boolean;
  onMessage(handler: TransportEventHandler): void;
  onClose(handler: TransportCloseHandler): void;
  onOpen(handler: () => void): void;
}

export type TransportSendFn = (message: Record<string, unknown>) => void;
