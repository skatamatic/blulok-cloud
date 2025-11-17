export type AuthMessage = {
  type: 'AUTH';
  token: string;
  facilityId: string;
};

export type AuthOkMessage = {
  type: 'AUTH_OK';
  facilityId: string;
};

export type ErrorMessage = {
  type: 'ERROR';
  code: string;
  message: string;
};

export type PingMessage = { type: 'PING' };
export type PongMessage = { type: 'PONG' };

export type ProxyRequestMessage = {
  type: 'PROXY_REQUEST';
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
};

export type ProxyResponseMessage = {
  type: 'PROXY_RESPONSE';
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
};

export type CommandMessage = {
  type: 'COMMAND';
  id: string;
  commandType: string;
  payload: any;
};

export type CommandAckMessage = {
  type: 'COMMAND_ACK';
  id: string;
  status: 'ok' | 'error';
  message?: string;
};

export type GatewayInboundMessage = AuthMessage | PongMessage | ProxyRequestMessage | CommandAckMessage;
export type GatewayOutboundMessage = AuthOkMessage | ErrorMessage | PingMessage | ProxyResponseMessage | CommandMessage;

// Minimal runtime guards (no zod dependency)
export function isAuthMessage(m: any): m is AuthMessage {
  return m && m.type === 'AUTH' && typeof m.token === 'string' && typeof m.facilityId === 'string';
}
export function isPong(m: any): m is PongMessage { return m && m.type === 'PONG'; }
export function isProxyRequest(m: any): m is ProxyRequestMessage {
  return m && m.type === 'PROXY_REQUEST' && typeof m.id === 'string' && typeof m.method === 'string' && typeof m.path === 'string';
}


