import { EventEmitter } from 'events';
import {
  ProtocolVersion,
  DeviceType,
  GatewayConnectionState,
  MessageType,
  CommandPriority,
  IDeviceInfo,
  IGatewayMessage,
} from '../../../types/gateway.types';

jest.mock('../../../services/device-sync.service');

jest.mock('@/models/gateway.model', () => {
  const methods = {
    findById: jest.fn().mockResolvedValue({ id: 'test-gateway', status: 'offline', name: 'GW' }),
    updateStatusAndLastSeen: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
  const GatewayModel = jest.fn().mockImplementation(() => methods);
  (GatewayModel as any).__methods = methods;
  return { GatewayModel };
});

jest.mock('@/utils/gateway-status-notification.util', () => ({
  notifyGatewayStatusAfterDbUpdate: jest.fn(),
}));

jest.mock('@/services/websocket.service', () => {
  const broadcastGatewayStatusUpdate = jest.fn().mockResolvedValue(undefined);
  return {
    WebSocketService: {
      getInstance: jest.fn(() => ({ broadcastGatewayStatusUpdate })),
      __broadcast: broadcastGatewayStatusUpdate,
    },
  };
});

import { GatewayModel } from '@/models/gateway.model';
import { WebSocketService } from '@/services/websocket.service';
import { BaseGateway } from '../../../services/gateway/gateways/base.gateway';
import { DeviceSyncService } from '../../../services/device-sync.service';

const gatewayModelMocks = (GatewayModel as any).__methods as {
  findById: jest.Mock;
  updateStatusAndLastSeen: jest.Mock;
  updateStatus: jest.Mock;
};
const mockBroadcast = (WebSocketService as any).__broadcast as jest.Mock;

class TestGateway extends BaseGateway {
  public lastRegistration?: IDeviceInfo;
  public lastUnregistration?: string;
  public protocolFail = false;

  constructor(id: string, facilityId: string) {
    super(id, facilityId);
  }

  get capabilities() {
    return {
      supportedProtocols: [ProtocolVersion.V1_0, ProtocolVersion.V1_1],
      maxConnections: 1,
      supportedDeviceTypes: [DeviceType.LOCK],
      firmwareUpdateSupport: false,
      remoteAccessSupport: true,
      keyManagementSupport: true,
      heartbeatInterval: 1000,
    };
  }

  public testHandleIncomingData(data: Buffer) {
    return this.handleIncomingData(data);
  }

  public testHandleConnectionError(error: Error) {
    return this.handleConnectionError(error);
  }

  public testHandleConnectionClose() {
    return this.handleConnectionClose();
  }

  public testSendHeartbeat() {
    return this.sendHeartbeat();
  }

  public testStartHeartbeat() {
    return this.startHeartbeat();
  }

  public exposeConnection() {
    return this.connection;
  }

  protected createProtocol() {
    return {
      validateMessage: jest.fn((m: IGatewayMessage) => !this.protocolFail && !!m?.type),
      encodeMessage: jest.fn(() => Buffer.from('encoded')),
      decodeMessage: jest.fn((data: Buffer) => JSON.parse(data.toString()) as IGatewayMessage),
    } as any;
  }

  protected createConnection() {
    const conn = new EventEmitter() as any;
    conn.connect = jest.fn().mockResolvedValue(undefined);
    conn.disconnect = jest.fn().mockResolvedValue(undefined);
    conn.send = jest.fn().mockResolvedValue(undefined);
    conn.isConnected = jest.fn().mockReturnValue(true);
    return conn;
  }

  protected sendDeviceRegistration(deviceInfo: IDeviceInfo) {
    this.lastRegistration = deviceInfo;
    return Promise.resolve();
  }

  protected sendDeviceUnregistration(deviceId: string) {
    this.lastUnregistration = deviceId;
    return Promise.resolve();
  }
}

const sampleDevice: IDeviceInfo = {
  id: 'lock-1',
  type: DeviceType.LOCK,
  model: 'M1',
  serialNumber: 'S1',
  firmwareVersion: '1.0',
  hardwareRevision: '1',
  installedAt: new Date(),
  configuration: {},
};

describe('BaseGateway (extended coverage)', () => {
  let gateway: TestGateway;
  let mockDeviceSyncService: jest.Mocked<DeviceSyncService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockBroadcast.mockResolvedValue(undefined);
    mockDeviceSyncService = {
      syncGatewayDevices: jest.fn().mockResolvedValue(undefined),
      updateDeviceStatuses: jest.fn().mockResolvedValue(undefined),
    } as any;
    (DeviceSyncService.getInstance as jest.Mock).mockReturnValue(mockDeviceSyncService);
    gatewayModelMocks.findById.mockResolvedValue({ id: 'test-gateway', status: 'offline', name: 'GW' });
    gatewayModelMocks.updateStatusAndLastSeen.mockResolvedValue(undefined);
    gatewayModelMocks.updateStatus.mockResolvedValue(undefined);

    gateway = new TestGateway('test-gateway', 'test-facility');
  });

  afterEach(async () => {
    await gateway.shutdown().catch(() => undefined);
    jest.useRealTimers();
  });

  describe('initialize & shutdown', () => {
    it('initializes protocol, connection, and emits initialized', async () => {
      const initialized = jest.fn();
      gateway.on('initialized', initialized);
      await gateway.initialize();
      expect(initialized).toHaveBeenCalled();
      expect(gateway.exposeConnection()).toBeDefined();
    });

    it('propagates initialization errors', async () => {
      jest.spyOn(gateway as any, 'createProtocol').mockImplementation(() => {
        throw new Error('protocol boom');
      });
      await expect(gateway.initialize()).rejects.toThrow('protocol boom');
    });

    it('shutdown disconnects and emits shutdown', async () => {
      await gateway.initialize();
      const shut = jest.fn();
      gateway.on('shutdown', shut);
      await gateway.shutdown();
      expect(shut).toHaveBeenCalled();
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.DISCONNECTED);
    });

    it('shutdown surfaces disconnect failures', async () => {
      await gateway.initialize();
      (gateway.exposeConnection() as any).disconnect.mockRejectedValue(new Error('bye fail'));
      await expect(gateway.shutdown()).rejects.toThrow('bye fail');
    });
  });

  describe('connect & disconnect', () => {
    it('throws when not initialized', async () => {
      await expect(gateway.connect()).rejects.toThrow('Gateway not initialized');
    });

    it('connects, updates DB, and broadcasts when not silent', async () => {
      await gateway.initialize();
      const connected = jest.fn();
      gateway.on('connected', connected);
      await gateway.connect();
      expect(connected).toHaveBeenCalled();
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.CONNECTED);
      expect(gatewayModelMocks.updateStatusAndLastSeen).toHaveBeenCalledWith('test-gateway', 'online');
      expect(mockBroadcast).toHaveBeenCalled();
    });

    it('skips broadcast when silent', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('sets ERROR state on connect failure', async () => {
      await gateway.initialize();
      (gateway.exposeConnection() as any).connect.mockRejectedValue(new Error('nope'));
      await expect(gateway.connect()).rejects.toThrow('nope');
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.ERROR);
      expect(gateway.status.errorMessage).toBe('nope');
    });

    it('disconnects and marks offline', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      gatewayModelMocks.findById.mockResolvedValue({ id: 'test-gateway', status: 'online', name: 'GW' });
      const disconnected = jest.fn();
      gateway.on('disconnected', disconnected);
      await gateway.disconnect();
      expect(disconnected).toHaveBeenCalled();
      expect(gatewayModelMocks.updateStatus).toHaveBeenCalledWith('test-gateway', 'offline');
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.DISCONNECTED);
    });
  });

  describe('sendMessage', () => {
    const heartbeatMsg = (): IGatewayMessage => ({
      id: '1',
      type: MessageType.HEARTBEAT,
      source: 'cloud',
      destination: 'g',
      protocolVersion: ProtocolVersion.V1_1,
      timestamp: new Date(),
      payload: {},
      priority: CommandPriority.LOW,
    });

    it('throws when not initialized', async () => {
      await expect(gateway.sendMessage(heartbeatMsg())).rejects.toThrow('Gateway not initialized');
    });

    it('throws when not connected', async () => {
      await gateway.initialize();
      (gateway.exposeConnection() as any).isConnected.mockReturnValue(false);
      await expect(gateway.sendMessage(heartbeatMsg())).rejects.toThrow('Gateway not connected');
    });

    it('validates, encodes, and sends', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      const sent = jest.fn();
      gateway.on('messageSent', sent);
      const msg = { ...heartbeatMsg(), id: 'm1', destination: 'test-gateway' };
      await gateway.sendMessage(msg);
      expect((gateway.exposeConnection() as any).send).toHaveBeenCalledWith(Buffer.from('encoded'));
      expect(sent).toHaveBeenCalledWith(msg);
    });

    it('rejects invalid messages', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      gateway.protocolFail = true;
      await expect(gateway.sendMessage(heartbeatMsg())).rejects.toThrow('Invalid message format');
    });
  });

  describe('device registry', () => {
    it('registers and unregisters devices', async () => {
      await gateway.initialize();
      const registered = jest.fn();
      const unregistered = jest.fn();
      gateway.on('deviceRegistered', registered);
      gateway.on('deviceUnregistered', unregistered);

      await gateway.registerDevice(sampleDevice);
      expect(gateway.status.deviceCount).toBe(1);
      expect(gateway.lastRegistration).toEqual(sampleDevice);
      expect(registered).toHaveBeenCalledWith(sampleDevice);

      await gateway.unregisterDevice('lock-1');
      expect(gateway.status.deviceCount).toBe(0);
      expect(gateway.lastUnregistration).toBe('lock-1');
      expect(unregistered).toHaveBeenCalledWith('lock-1');
    });

    it('throws when unregistering unknown device', async () => {
      await gateway.initialize();
      await expect(gateway.unregisterDevice('missing')).rejects.toThrow(/not found/);
    });
  });

  describe('sendMessageAndWait / commands', () => {
    it('resolves when correlated response arrives', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      const sendSpy = jest.spyOn(gateway, 'sendMessage');
      const statusPromise = gateway.executeDeviceCommand('lock-1', 'LOCK', {});
      await Promise.resolve();
      const sentMsg = sendSpy.mock.calls[0][0];

      gateway.emit('messageReceived', {
        id: 'resp',
        correlationId: sentMsg.id,
        type: MessageType.DEVICE_COMMAND_RESPONSE,
        source: 'gw',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.V1_1,
        timestamp: new Date(),
        payload: { success: true, executedAt: new Date(), duration: 5 },
        priority: CommandPriority.NORMAL,
      });

      await expect(statusPromise).resolves.toMatchObject({ success: true });
    });

    it('times out waiting for response', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      const p = gateway.getDeviceStatus('lock-1');
      jest.advanceTimersByTime(5000);
      await expect(p).rejects.toThrow(/Response timeout/);
    });

    it('returns failure payload when command response empty', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      const sendSpy = jest.spyOn(gateway, 'sendMessage');
      const p = gateway.executeDeviceCommand('lock-1', 'UNLOCK');
      await Promise.resolve();
      const sentMsg = sendSpy.mock.calls[0][0];
      gateway.emit('messageReceived', {
        id: 'resp',
        correlationId: sentMsg.id,
        type: MessageType.DEVICE_COMMAND_RESPONSE,
        source: 'gw',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.V1_1,
        timestamp: new Date(),
        payload: null,
        priority: CommandPriority.NORMAL,
      });
      await expect(p).resolves.toMatchObject({ success: false, error: 'Invalid response format' });
    });
  });

  describe('incoming data & message handling', () => {
    it('decodes incoming data and handles heartbeat', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      jest.spyOn(gateway, 'sendMessage').mockResolvedValue(undefined);

      const received = jest.fn();
      gateway.on('messageReceived', received);
      await gateway.testHandleIncomingData(
        Buffer.from(
          JSON.stringify({
            id: 'hb-1',
            type: MessageType.HEARTBEAT,
            source: 'gw',
            destination: 'cloud',
            protocolVersion: ProtocolVersion.V1_1,
            timestamp: new Date(),
            payload: { uptime: 10, memoryUsage: 1, cpuUsage: 2 },
            priority: CommandPriority.LOW,
          }),
        ),
      );
      expect(received).toHaveBeenCalled();
      expect(gateway.status.lastHeartbeat).toBeDefined();
      expect(gatewayModelMocks.updateStatusAndLastSeen).toHaveBeenCalled();
    });

    it('handles ERROR messages', async () => {
      await gateway.initialize();
      const errHandler = jest.fn();
      gateway.on('gatewayError', errHandler);
      await gateway.testHandleIncomingData(
        Buffer.from(
          JSON.stringify({
            id: 'e1',
            type: MessageType.ERROR,
            source: 'gw',
            destination: 'cloud',
            protocolVersion: ProtocolVersion.V1_1,
            timestamp: new Date(),
            payload: { error: 'boom' },
            priority: CommandPriority.HIGH,
          }),
        ),
      );
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.ERROR);
      expect(gateway.status.errorMessage).toBe('boom');
      expect(errHandler).toHaveBeenCalledWith({ error: 'boom' });
    });

    it('emits generic messages for other types', async () => {
      await gateway.initialize();
      const msgHandler = jest.fn();
      gateway.on('message', msgHandler);
      await gateway.testHandleIncomingData(
        Buffer.from(
          JSON.stringify({
            id: 'x',
            type: MessageType.DEVICE_STATUS_RESPONSE,
            source: 'gw',
            destination: 'cloud',
            protocolVersion: ProtocolVersion.V1_1,
            timestamp: new Date(),
            payload: { ok: true },
            priority: CommandPriority.NORMAL,
          }),
        ),
      );
      expect(msgHandler).toHaveBeenCalled();
    });

    it('swallows decode errors', async () => {
      await gateway.initialize();
      const error = jest.fn();
      gateway.on('error', error);
      await gateway.testHandleIncomingData(Buffer.from('not-json'));
      expect(error).toHaveBeenCalled();
    });
  });

  describe('connection error/close & heartbeat', () => {
    it('handleConnectionError updates DB to error', async () => {
      jest.useRealTimers();
      await gateway.initialize();
      gatewayModelMocks.findById.mockResolvedValue({ id: 'test-gateway', status: 'online', name: 'GW' });
      const errEvt = jest.fn();
      gateway.on('connectionError', errEvt);
      gateway.testHandleConnectionError(new Error('socket down'));
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.ERROR);
      expect(errEvt).toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(gatewayModelMocks.updateStatus).toHaveBeenCalledWith('test-gateway', 'error');
    });

    it('handleConnectionClose marks offline', async () => {
      jest.useRealTimers();
      await gateway.initialize();
      gatewayModelMocks.findById.mockResolvedValue({ id: 'test-gateway', status: 'online', name: 'GW' });
      const closed = jest.fn();
      gateway.on('connectionClosed', closed);
      gateway.testHandleConnectionClose();
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.DISCONNECTED);
      expect(closed).toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(gatewayModelMocks.updateStatus).toHaveBeenCalledWith('test-gateway', 'offline');
    });

    it('startHeartbeat sends when connected', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      const sendSpy = jest.spyOn(gateway, 'sendMessage').mockResolvedValue(undefined);
      gateway.testStartHeartbeat();
      jest.advanceTimersByTime(1000);
      expect(sendSpy).toHaveBeenCalled();
    });

    it('sendHeartbeat swallows send failures', async () => {
      await gateway.initialize();
      await gateway.connect(true);
      jest.spyOn(gateway, 'sendMessage').mockRejectedValue(new Error('hb fail'));
      const error = jest.fn();
      gateway.on('error', error);
      await gateway.testSendHeartbeat();
      expect(error).toHaveBeenCalled();
    });
  });

  describe('default sync', () => {
    it('throws requiring subclass implementation', async () => {
      await expect(gateway.sync()).rejects.toThrow(/must be implemented/);
    });
  });

  describe('connection event wiring', () => {
    it('wires data/error/close/stateChanged from connection', async () => {
      await gateway.initialize();
      const conn = gateway.exposeConnection() as EventEmitter;
      jest.spyOn(gateway as any, 'handleIncomingData').mockResolvedValue(undefined);
      conn.emit('data', Buffer.from('x'));
      conn.emit('error', new Error('e'));
      conn.emit('close');
      conn.emit('stateChanged', { newState: GatewayConnectionState.CONNECTED });
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.CONNECTED);
    });
  });
});
