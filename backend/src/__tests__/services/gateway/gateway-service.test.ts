import { EventEmitter } from 'events';
import { GatewayService } from '@/services/gateway/gateway.service';
import { GatewayFactory } from '@/services/gateway/gateways/gateway-factory';

jest.mock('ws', () => ({
  WebSocket: jest.fn(),
  WebSocketServer: jest.fn(),
}));

const mockFindAll = jest.fn();
jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findAll: mockFindAll,
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
}));

function buildGateway(id: string, facilityId: string) {
  const g = new EventEmitter() as any;
  g.id = id;
  g.facilityId = facilityId;
  g.capabilities = { keyManagementSupport: true };
  g.keyManagementVersion = 'v2';
  g.status = { ok: true };
  g.initialize = jest.fn().mockResolvedValue(undefined);
  g.connect = jest.fn().mockResolvedValue(undefined);
  g.disconnect = jest.fn().mockResolvedValue(undefined);
  g.shutdown = jest.fn().mockResolvedValue(undefined);
  g.registerDevice = jest.fn().mockResolvedValue(undefined);
  g.unregisterDevice = jest.fn().mockResolvedValue(undefined);
  g.getDeviceStatus = jest.fn().mockResolvedValue({ online: true });
  g.executeDeviceCommand = jest.fn().mockResolvedValue({ success: true });
  g.addKey = jest.fn().mockResolvedValue({ success: true });
  g.revokeKey = jest.fn().mockResolvedValue({ success: true });
  g.getKeys = jest.fn().mockResolvedValue([]);
  g.getAllLocks = jest.fn().mockResolvedValue([{ id: 'l1' }]);
  g.sendFCMMessage = jest.fn().mockResolvedValue({ success: true });
  return g;
}

jest.mock('@/services/gateway/gateways/gateway-factory', () => ({
  GatewayFactory: {
    createFromConfig: jest.fn(),
  },
}));

describe('GatewayService', () => {
  let service: GatewayService;
  let gw: ReturnType<typeof buildGateway>;

  beforeEach(() => {
    jest.clearAllMocks();
    (GatewayService as unknown as { instance?: GatewayService }).instance = undefined;
    service = GatewayService.getInstance();
    gw = buildGateway('gw-1', 'fac-1');
    (GatewayFactory.createFromConfig as jest.Mock).mockReturnValue(gw);
  });

  afterEach(async () => {
    await service.shutdown().catch(() => undefined);
    (service as any).activeGateways?.clear();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const service1 = GatewayService.getInstance();
      const service2 = GatewayService.getInstance();
      expect(service1).toBe(service2);
      expect(service1).toBe(service);
    });

    it('should be an EventEmitter', () => {
      expect(service).toBeInstanceOf(GatewayService);
      expect(typeof service.on).toBe('function');
      expect(typeof service.emit).toBe('function');
    });
  });

  describe('Initialization', () => {
    it('should initialize without errors', () => {
      expect(service).toBeDefined();
      expect(typeof service).toBe('object');
    });

    it('should have gateway model', () => {
      expect((service as any).gatewayModel).toBeDefined();
    });

    it('should have active gateways map', () => {
      expect((service as any).activeGateways).toBeInstanceOf(Map);
    });
  });

  describe('lifecycle and commands', () => {
    it('initializeAllGateways ignores gateways without facility_id', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'a', facility_id: null, gateway_type: 'simulated' },
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      expect(GatewayFactory.createFromConfig).toHaveBeenCalled();
    });

    it('initializeGateway throws when facility_id missing', async () => {
      await expect(
        service.initializeGateway({ id: 'x', facility_id: null } as any)
      ).rejects.toThrow(/unassigned/);
    });

    it('connectGateway and disconnectGateway delegate to active gateway', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      await service.connectGateway('gw-1');
      await service.disconnectGateway('gw-1');
      expect(gw.connect).toHaveBeenCalled();
      expect(gw.disconnect).toHaveBeenCalled();
    });

    it('throws when gateway id unknown for connect', async () => {
      await expect(service.connectGateway('missing')).rejects.toThrow(/not found/);
    });

    it('registerDevice and executeDeviceCommand forward', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      await service.registerDevice('gw-1', { id: 'd1' } as any);
      const res = await service.executeDeviceCommand('gw-1', 'd1', 'PING');
      expect(gw.registerDevice).toHaveBeenCalled();
      expect(gw.executeDeviceCommand).toHaveBeenCalled();
      expect(res.success).toBe(true);
    });

    it('addKey throws when key management unsupported', async () => {
      gw.capabilities.keyManagementSupport = false;
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      await expect(service.addKey('gw-1', 'dev', {} as any)).rejects.toThrow(/does not support key management/);
    });

    it('getAllLocks and canGetAllLocks', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      expect(service.canGetAllLocks('gw-1')).toBe(true);
      const locks = await service.getAllLocks('gw-1');
      expect(locks).toHaveLength(1);
    });

    it('sendFCMMessage forwards when supported', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      await service.sendFCMMessage('gw-1', 'tok', { x: 1 });
      expect(gw.sendFCMMessage).toHaveBeenCalled();
    });

    it('sendFCMMessage throws when not implemented', async () => {
      delete gw.sendFCMMessage;
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      await expect(service.sendFCMMessage('gw-1', 't', {})).rejects.toThrow(/FCM messaging not implemented/);
    });

    it('getGatewayStatus and getGatewaysByFacility', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      expect(service.getGatewayStatus('gw-1')).toEqual({ ok: true });
      expect(service.getGatewaysByFacility('fac-1')).toHaveLength(1);
    });

    it('reinitializeGateway replaces cached gateway', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      const g2 = buildGateway('gw-1', 'fac-1');
      (GatewayFactory.createFromConfig as jest.Mock).mockReturnValue(g2);
      await service.reinitializeGateway({
        id: 'gw-1',
        facility_id: 'fac-1',
        gateway_type: 'simulated',
      } as any);
      expect(gw.disconnect).toHaveBeenCalled();
      expect(g2.initialize).toHaveBeenCalled();
    });

    it('getAllGatewayStatuses maps gateway status', async () => {
      mockFindAll.mockResolvedValue([
        { id: 'gw-1', facility_id: 'fac-1', gateway_type: 'simulated' },
      ]);
      await service.initializeAllGateways();
      expect(service.getAllGatewayStatuses()).toEqual([{ ok: true }]);
    });
  });
});
