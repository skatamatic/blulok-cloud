import { BaseConnection } from '../../../services/gateway/connections/base.connection';
import { GatewayConnectionState } from '../../../types/gateway.types';

describe('BaseConnection', () => {
  // Create a concrete implementation for testing
  class TestConnection extends BaseConnection {
    public readonly gatewayId = 'test-gateway';

    async connect(): Promise<void> {
      this.setState(GatewayConnectionState.CONNECTED);
    }

    async disconnect(): Promise<void> {
      this.setState(GatewayConnectionState.DISCONNECTED);
    }

    async send(_data: Buffer): Promise<void> {
      // Mock send implementation
    }

    override isConnected(): boolean {
      return this.state === GatewayConnectionState.CONNECTED;
    }

    override getStats() {
      return super.getStats();
    }
  }

  let connection: TestConnection;

  beforeEach(() => {
    connection = new TestConnection();
  });

  describe('Initial State', () => {
    it('should initialize in disconnected state', () => {
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);
    });

    it('should have undefined timestamps initially', () => {
      const stats = connection.getStats();
      expect(stats.connectedAt).toBeUndefined();
      expect(stats.lastActivity).toBeUndefined();
      expect(stats.bytesSent).toBe(0);
      expect(stats.bytesReceived).toBe(0);
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
    });
  });

  describe('Connection Lifecycle', () => {
    it('should connect successfully', async () => {
      await connection.connect();
      expect(connection.state).toBe(GatewayConnectionState.CONNECTED);
      expect(connection.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await connection.connect();
      expect(connection.state).toBe(GatewayConnectionState.CONNECTED);

      await connection.disconnect();
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);
      expect(connection.isConnected()).toBe(false);
    });

    it('should update connectedAt timestamp on connection', async () => {
      const beforeConnect = Date.now();
      await connection.connect();

      const stats = connection.getStats();
      expect(stats.connectedAt).toBeDefined();
      expect(stats.connectedAt!.getTime()).toBeGreaterThanOrEqual(beforeConnect);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors', async () => {
      class FailingConnection extends BaseConnection {
        public readonly gatewayId = 'test-gateway';

        async connect(): Promise<void> {
          throw new Error('Connection failed');
        }

        async disconnect(): Promise<void> {
          this.setState(GatewayConnectionState.DISCONNECTED);
        }

        async send(_data: Buffer): Promise<void> {}
        override isConnected(): boolean {
          return false;
        }
      }

      const failingConnection = new FailingConnection();

      await expect(failingConnection.connect()).rejects.toThrow('Connection failed');
      expect(failingConnection.state).toBe(GatewayConnectionState.DISCONNECTED);
    });
  });

  describe('Statistics', () => {
    it('should track connection statistics', async () => {
      await connection.connect();

      // Simulate some activity by directly setting properties
      (connection as any).bytesSent = 100;
      (connection as any).bytesReceived = 200;
      (connection as any).messagesSent = 5;
      (connection as any).messagesReceived = 3;
      (connection as any).lastActivity = new Date();

      const stats = connection.getStats();
      expect(stats.bytesSent).toBe(100);
      expect(stats.bytesReceived).toBe(200);
      expect(stats.messagesSent).toBe(5);
      expect(stats.messagesReceived).toBe(3);
      expect(stats.lastActivity).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should handle all state transitions', () => {
      const states = [
        GatewayConnectionState.DISCONNECTED,
        GatewayConnectionState.CONNECTING,
        GatewayConnectionState.CONNECTED,
        GatewayConnectionState.RECONNECTING,
        GatewayConnectionState.ERROR,
      ];

      states.forEach(state => {
        (connection as any).setState(state);
        expect(connection.state).toBe(state);
      });
    });
  });
});
