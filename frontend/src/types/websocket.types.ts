export interface WebSocketMessage {
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics';
  subscriptionId?: string;
  subscriptionType?: string;
  data?: any;
  error?: string;
  timestamp: string;
}

export interface LogUpdate {
  logType: string;
  content: string;
  timestamp: string;
}

export interface WebSocketStats {
  totalClients: number;
  totalSubscriptions: number;
  subscriptionsByType: Record<string, number>;
  logWatchers: number;
}

export interface Subscription {
  id: string;
  type: string;
  userId: string;
  userRole: string;
  createdAt: string;
  lastHeartbeat: string;
  filters?: Record<string, any>;
}

export interface DiagnosticsData {
  totalClients: number;
  totalSubscriptions: number;
  clientSubscriptions: Subscription[];
  allSubscriptions: Subscription[];
  logWatchers: Record<string, number>;
}

export interface IWebSocketService {
  subscribe(subscriptionType: string, filters?: any): void;
  unsubscribe(subscriptionType: string): void;
  onMessage(subscriptionType: string, handler: (data: any) => void): () => void;
  onConnectionChange(handler: (connected: boolean) => void): () => void;
  requestDiagnostics(): void;
  isWebSocketConnected(): boolean;
  disconnect(): void;
}


