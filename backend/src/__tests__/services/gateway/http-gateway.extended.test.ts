import { HttpGateway } from '../../../services/gateway/gateways/http.gateway';
import { DeviceType, DeviceConnectionState, ProtocolVersion } from '../../../types/gateway.types';
import { DeviceSyncService } from '../../../services/device-sync.service';

jest.mock('../../../services/device-sync.service');
jest.mock('../../../services/device-event.service');

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
    interceptors: { response: { use: jest.fn() } },
    defaults: { headers: { common: {} } },
  })),
}));

jest.mock('@/models/gateway.model', () => {
  const methods = {
    findById: jest.fn().mockResolvedValue({ id: 'http-gw', status: 'online', name: 'HTTP' }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    updateStatusAndLastSeen: jest.fn().mockResolvedValue(undefined),
  };
  const GatewayModel = jest.fn().mockImplementation(() => methods);
  (GatewayModel as any).__methods = methods;
  return { GatewayModel };
});

jest.mock('@/utils/gateway-status-notification.util', () => ({
  notifyGatewayStatusAfterDbUpdate: jest.fn(),
}));

jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: () => ({ broadcastGatewayStatusUpdate: jest.fn().mockResolvedValue(undefined) }),
  },
}));

import { GatewayModel } from '@/models/gateway.model';

const gatewayModelMocks = (GatewayModel as any).__methods as {
  findById: jest.Mock;
  updateStatus: jest.Mock;
  updateStatusAndLastSeen: jest.Mock;
};

describe('HttpGateway (extended coverage)', () => {
  let gateway: HttpGateway;
  let mockConn: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    isConnected: jest.Mock;
    makeRequest: jest.Mock;
  };
  let mockDeviceSyncService: jest.Mocked<DeviceSyncService>;

  async function initWithMockConn(opts?: {
    keyManagementVersion?: 'v1' | 'v2';
    pollFrequencyMs?: number;
  }) {
    gateway = new HttpGateway(
      'http-gw',
      'fac-1',
      'https://gw.example/api',
      'api-key',
      ProtocolVersion.V1_1,
      opts?.pollFrequencyMs ?? 30000,
      opts?.keyManagementVersion ?? 'v1',
      false,
    );
    await gateway.initialize();
    mockConn = (gateway as any).httpConnection;
    mockConn.connect = jest.fn().mockResolvedValue(undefined);
    mockConn.disconnect = jest.fn().mockResolvedValue(undefined);
    mockConn.isConnected = jest.fn().mockReturnValue(true);
    mockConn.makeRequest = jest.fn();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockDeviceSyncService = {
      syncGatewayDevices: jest.fn().mockResolvedValue(undefined),
      updateDeviceStatuses: jest.fn().mockResolvedValue(undefined),
    } as any;
    (DeviceSyncService.getInstance as jest.Mock).mockReturnValue(mockDeviceSyncService);
    gatewayModelMocks.findById.mockResolvedValue({ id: 'http-gw', status: 'online', name: 'HTTP' });
    gatewayModelMocks.updateStatus.mockResolvedValue(undefined);
    gatewayModelMocks.updateStatusAndLastSeen.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (gateway) await gateway.shutdown().catch(() => undefined);
    jest.useRealTimers();
  });

  describe('getDeviceStatus', () => {
    it('throws when connection missing', async () => {
      gateway = new HttpGateway('http-gw', 'fac-1', 'https://gw.example/api', 'k');
      await expect(gateway.getDeviceStatus('d1')).rejects.toThrow('Gateway not connected');
    });

    it('maps lock state on success', async () => {
      await initWithMockConn();
      mockConn.makeRequest.mockResolvedValue({
        locked: true,
        batteryLevel: 80,
        signalStrength: -40,
        temperature: 22,
      });
      const status = await gateway.getDeviceStatus('lock-1');
      expect(status).toMatchObject({
        id: 'lock-1',
        connectionState: DeviceConnectionState.ONLINE,
        isLocked: true,
        batteryLevel: 80,
        hasError: false,
      });
    });
  });

  describe('executeDeviceCommand', () => {
    beforeEach(async () => {
      await initWithMockConn();
    });

    it('maps LOCK/CLOSE and UNLOCK/OPEN', async () => {
      mockConn.makeRequest.mockResolvedValue({});
      await expect(gateway.executeDeviceCommand('d1', 'LOCK')).resolves.toMatchObject({
        success: true,
      });
      expect(mockConn.makeRequest).toHaveBeenCalledWith(
        'POST',
        '/locks/send-lock-command',
        expect.objectContaining({ lockId: 'd1', command: 'CLOSE' }),
      );

      await gateway.executeDeviceCommand('d1', 'OPEN', { open_until: 123 });
      expect(mockConn.makeRequest).toHaveBeenCalledWith(
        'POST',
        '/locks/send-lock-command',
        expect.objectContaining({ command: 'OPEN', open_until: 123 }),
      );
    });

    it('returns failure for unsupported commands', async () => {
      const result = await gateway.executeDeviceCommand('d1', 'BLINK');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unsupported command/);
    });

    it('returns failure when request throws', async () => {
      mockConn.makeRequest.mockRejectedValue(new Error('net'));
      const result = await gateway.executeDeviceCommand('d1', 'UNLOCK');
      expect(result).toMatchObject({ success: false, error: 'net' });
    });
  });

  describe('key management', () => {
    it('addKey uses v1 payload and extracts keyCode', async () => {
      await initWithMockConn({ keyManagementVersion: 'v1' });
      mockConn.makeRequest.mockResolvedValue({ key_code: 42 });
      const result = await gateway.addKey('d1', {
        key_secret: 'sec',
        key_token: 'tok',
        revision: 1,
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ keyCode: 42 });
      expect(mockConn.makeRequest).toHaveBeenCalledWith(
        'POST',
        '/keys/add-key',
        expect.objectContaining({
          lockId: 'd1',
          key_secret: 'sec',
          key_token: 'tok',
          revision: 1,
        }),
      );
    });

    it('addKey uses v2 public_key / user_id fields', async () => {
      await initWithMockConn({ keyManagementVersion: 'v2' });
      mockConn.makeRequest.mockResolvedValue({});
      const result = await gateway.addKey('d1', {
        public_key: 'pk',
        user_id: 'u1',
      });
      expect(result.success).toBe(true);
      expect(mockConn.makeRequest).toHaveBeenCalledWith(
        'POST',
        '/keys/add-key',
        { lockId: 'd1', public_key: 'pk', user_id: 'u1' },
      );
    });

    it('addKey returns failure on error', async () => {
      await initWithMockConn();
      mockConn.makeRequest.mockRejectedValue(new Error('denied'));
      await expect(gateway.addKey('d1', {})).resolves.toMatchObject({
        success: false,
        error: 'denied',
      });
    });

    it('revokeKey uses public_key for v2', async () => {
      await initWithMockConn({ keyManagementVersion: 'v2' });
      mockConn.makeRequest.mockResolvedValue({});
      await expect(gateway.revokeKey('d1', 0, 'pk')).resolves.toMatchObject({ success: true });
      expect(mockConn.makeRequest).toHaveBeenCalledWith(
        'DELETE',
        '/keys/revoke-key',
        undefined,
        { lockId: 'd1', public_key: 'pk' },
      );
    });

    it('revokeKey uses keyCode for v1', async () => {
      await initWithMockConn({ keyManagementVersion: 'v1' });
      mockConn.makeRequest.mockResolvedValue({});
      await gateway.revokeKey('d1', 7);
      expect(mockConn.makeRequest).toHaveBeenCalledWith(
        'DELETE',
        '/keys/revoke-key',
        undefined,
        { lockId: 'd1', keyCode: '7' },
      );
    });

    it('getKeys unwraps common response shapes', async () => {
      await initWithMockConn();
      mockConn.makeRequest.mockResolvedValueOnce([{ id: 1 }]);
      await expect(gateway.getKeys('d1')).resolves.toEqual([{ id: 1 }]);

      mockConn.makeRequest.mockResolvedValueOnce({ data: [{ id: 2 }] });
      await expect(gateway.getKeys('d1')).resolves.toEqual([{ id: 2 }]);

      mockConn.makeRequest.mockResolvedValueOnce({ keys: [{ id: 3 }] });
      await expect(gateway.getKeys('d1')).resolves.toEqual([{ id: 3 }]);
    });

    it('getKeys rejects HTML and unexpected objects', async () => {
      await initWithMockConn();
      mockConn.makeRequest.mockResolvedValueOnce('<!DOCTYPE html><html></html>');
      await expect(gateway.getKeys('d1')).rejects.toThrow(/HTML response/);

      mockConn.makeRequest.mockResolvedValueOnce({ weird: true });
      await expect(gateway.getKeys('d1')).rejects.toThrow(/Unexpected response format/);
    });

    it('getKeys maps HTTP status errors', async () => {
      await initWithMockConn();
      mockConn.makeRequest.mockRejectedValueOnce({ response: { status: 404 }, message: 'nf' });
      await expect(gateway.getKeys('d1')).rejects.toThrow(/Key retrieval endpoint not found/);

      mockConn.makeRequest.mockRejectedValueOnce({ response: { status: 401 }, message: 'auth' });
      await expect(gateway.getKeys('d1')).rejects.toThrow(/Authentication failed/);

      mockConn.makeRequest.mockRejectedValueOnce({ response: { status: 503 }, message: 'down' });
      await expect(gateway.getKeys('d1')).rejects.toThrow(/Gateway server error/);
    });
  });

  describe('getAllLocks', () => {
    beforeEach(async () => {
      await initWithMockConn();
    });

    it('unwraps array and nested wrappers', async () => {
      mockConn.makeRequest.mockResolvedValueOnce([{ id: 'a' }]);
      await expect(gateway.getAllLocks()).resolves.toEqual([{ id: 'a' }]);

      mockConn.makeRequest.mockResolvedValueOnce({ locks: [{ id: 'b' }] });
      await expect(gateway.getAllLocks()).resolves.toEqual([{ id: 'b' }]);

      mockConn.makeRequest.mockResolvedValueOnce({ devices: [{ id: 'c' }] });
      await expect(gateway.getAllLocks()).resolves.toEqual([{ id: 'c' }]);

      mockConn.makeRequest.mockResolvedValueOnce({ data: [{ id: 'd' }] });
      await expect(gateway.getAllLocks()).resolves.toEqual([{ id: 'd' }]);
    });

    it('maps connection and auth errors', async () => {
      mockConn.makeRequest.mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'refused' });
      await expect(gateway.getAllLocks()).rejects.toThrow(/Cannot connect to gateway/);

      mockConn.makeRequest.mockRejectedValueOnce({ response: { status: 401 }, message: 'auth' });
      await expect(gateway.getAllLocks()).rejects.toThrow(/Authentication failed/);
    });

    it('rejects HTML and status 404 object', async () => {
      mockConn.makeRequest.mockResolvedValueOnce('<!DOCTYPE html>x');
      await expect(gateway.getAllLocks()).rejects.toThrow(/HTML response/);

      mockConn.makeRequest.mockResolvedValueOnce({ status: 404 });
      await expect(gateway.getAllLocks()).rejects.toThrow(/API endpoint not found/);
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      await initWithMockConn();
    });

    it('syncs devices and collects keys', async () => {
      mockConn.makeRequest
        .mockResolvedValueOnce([{ id: 'lock-1', serial: 'S1', online: true, status: 'Closed' }])
        .mockResolvedValueOnce([{ key: 1 }]);

      const result = await gateway.sync(true);
      expect(result.syncResults.devicesFound).toBe(1);
      expect(result.syncResults.devicesSynced).toBe(1);
      expect(result.syncResults.keysRetrieved).toBe(1);
      expect(result.devices[0].keys).toEqual([{ key: 1 }]);
      expect(gatewayModelMocks.updateStatusAndLastSeen).toHaveBeenCalledWith('http-gw', 'online');
    });

    it('continues when per-device keys fail', async () => {
      mockConn.makeRequest
        .mockResolvedValueOnce([{ lockId: 'L2', online: false }])
        .mockRejectedValueOnce(new Error('keys down'));

      const result = await gateway.sync(false);
      expect(result.devices[0].keys).toEqual([]);
      expect(result.syncResults.errors.some((e) => e.includes('Failed to get keys'))).toBe(true);
    });

    it('marks offline on critical getAllLocks failure when updateStatus', async () => {
      mockConn.makeRequest.mockRejectedValue(new Error('API endpoint not found at /locks'));
      await expect(gateway.sync(true)).rejects.toThrow(/Failed to get device list/);
      expect(gatewayModelMocks.updateStatus).toHaveBeenCalledWith('http-gw', 'offline');
    });

    it('returns partial results for non-critical list failures', async () => {
      mockConn.makeRequest.mockRejectedValue(new Error('temporary blip'));
      const result = await gateway.sync(false);
      expect(result.devices).toEqual([]);
      expect(result.syncResults.errors[0]).toMatch(/Failed to get device list/);
    });
  });

  describe('polling reconnect', () => {
    it('attempts reconnect after consecutive failures', async () => {
      await initWithMockConn();
      await gateway.connect(true);
      (gateway as any).consecutiveFailures = 3;
      const connectSpy = jest.spyOn(gateway, 'connect').mockResolvedValue(undefined);
      mockConn.makeRequest.mockResolvedValue([]);

      await (gateway as any).pollAndSyncDevices();
      expect(connectSpy).toHaveBeenCalled();
      expect((gateway as any).consecutiveFailures).toBe(0);
    });

    it('increments failures when sync throws', async () => {
      await initWithMockConn();
      jest.spyOn(gateway, 'sync').mockRejectedValue(new Error('poll fail'));
      await (gateway as any).pollAndSyncDevices();
      expect((gateway as any).consecutiveFailures).toBe(1);
    });

    it('no-ops poll when httpConnection missing', async () => {
      gateway = new HttpGateway('http-gw', 'fac-1', 'https://gw.example/api', 'k');
      await expect((gateway as any).pollAndSyncDevices()).resolves.toBeUndefined();
    });
  });

  describe('misc helpers', () => {
    it('sendDeviceRegistration / unregistration are no-op logs', async () => {
      await initWithMockConn();
      await (gateway as any).sendDeviceRegistration({ id: 'd1' });
      await (gateway as any).sendDeviceUnregistration('d1');
      expect(gateway.capabilities.supportedDeviceTypes).toContain(DeviceType.LOCK);
    });

    it('sendFCMMessage simulates success', async () => {
      await initWithMockConn();
      const p = gateway.sendFCMMessage('token-abcdefghijklmnopqrstuvwxyz', { a: 1 });
      await jest.advanceTimersByTimeAsync(100);
      await expect(p).resolves.toMatchObject({ success: true });
    });

    it('getGatewayIP returns ip or null', async () => {
      await initWithMockConn();
      mockConn.makeRequest.mockResolvedValueOnce({ ip: '10.0.0.1' });
      await expect(gateway.getGatewayIP()).resolves.toBe('10.0.0.1');

      mockConn.makeRequest.mockRejectedValueOnce(new Error('nope'));
      await expect(gateway.getGatewayIP()).resolves.toBeNull();
    });

    it('throws when helpers called without connection', async () => {
      gateway = new HttpGateway('http-gw', 'fac-1', 'https://gw.example/api', 'k');
      await expect(gateway.addKey('d', {})).rejects.toThrow('Gateway not connected');
      await expect(gateway.revokeKey('d', 1)).rejects.toThrow('Gateway not connected');
      await expect(gateway.getKeys('d')).rejects.toThrow('Gateway not connected');
      await expect(gateway.getAllLocks()).rejects.toThrow('Gateway not connected');
      await expect(gateway.sendFCMMessage('t', {})).rejects.toThrow('Gateway not connected');
      await expect(gateway.getGatewayIP()).rejects.toThrow('Gateway not connected');
      await expect(gateway.executeDeviceCommand('d', 'LOCK')).rejects.toThrow('Gateway not connected');
    });
  });
});
