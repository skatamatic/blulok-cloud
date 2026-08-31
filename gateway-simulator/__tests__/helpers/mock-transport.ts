import { vi } from 'vitest';
import { isAuthOkMessage } from '../../src/protocol/messages';
import type { AuthOkMessage, GatewaySessionRole } from '../../src/protocol/messages';
import type { ITransport, TransportCloseHandler, TransportEventHandler } from '../../src/main/net/ITransport';

export type MockTransport = ITransport & {
  getAuthOk: () => AuthOkMessage | null;
  emitMessage: (msg: unknown) => void;
  emitClose: (code?: number, reason?: string) => void;
  sent: unknown[];
};

type MockTransportOptions = {
  authOk?: AuthOkMessage | null;
  /** When true, auto-reply to PROXY_REQUEST with HTTP 200 (connect/inventory tests). */
  autoProxyResponse?: boolean;
  proxyStatus?: number;
  proxyBody?: unknown;
  proxyResponder?: (
    req: { method?: string; path?: string; id: string },
    callIndex: number,
  ) => { status: number; body: unknown };
  onSessionRoleChanged?: (auth: AuthOkMessage, previousRole?: GatewaySessionRole) => void;
};

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  const handlers: TransportEventHandler[] = [];
  let closeHandler: TransportCloseHandler | null = null;
  const sent: unknown[] = [];
  let proxyCallIndex = 0;
  const defaultAuth: AuthOkMessage = {
    type: 'AUTH_OK',
    facilityId: 'fac-1',
    gatewayId: 'gw-cloud-1',
    sessionRole: 'active',
  };
  let currentAuth: AuthOkMessage = options.authOk ?? defaultAuth;

  const emitMessage = (msg: unknown) => {
    if (isAuthOkMessage(msg) && msg.facilityId === 'fac-1') {
      const previousRole = currentAuth.sessionRole;
      currentAuth = msg;
      if (previousRole !== msg.sessionRole) {
        options.onSessionRoleChanged?.(msg, previousRole);
      }
    }
    for (const handler of handlers) handler(msg);
  };

  return {
    sent,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    send: vi.fn((msg) => {
      sent.push(msg);
      const record = msg as { type?: string; id?: string; method?: string; path?: string };
      if (record.type === 'PROXY_REQUEST' && record.id) {
        proxyCallIndex += 1;
        const response = options.proxyResponder
          ? options.proxyResponder(record, proxyCallIndex)
          : options.autoProxyResponse === false
            ? null
            : {
                status: options.proxyStatus ?? 200,
                body: options.proxyBody ?? { success: true },
              };
        if (response) {
          queueMicrotask(() =>
            emitMessage({
              type: 'PROXY_RESPONSE',
              id: record.id,
              status: response.status,
              body: response.body,
            }),
          );
        }
      }
    }),
    isConnected: vi.fn(() => true),
    onMessage: vi.fn((handler) => {
      handlers.push(handler);
    }),
    onClose: vi.fn((handler) => {
      closeHandler = handler;
    }),
    onOpen: vi.fn(),
    getAuthOk: () => currentAuth,
    emitMessage,
    emitClose: (code = 1000, reason = 'closed') => {
      closeHandler?.(code, reason);
    },
  };
}
