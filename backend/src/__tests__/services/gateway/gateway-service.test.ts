import { GatewayService } from '../../../services/gateway/gateway.service';

// Mock WebSocket to avoid import issues in tests
jest.mock('ws', () => ({
  WebSocket: jest.fn(),
  WebSocketServer: jest.fn(),
}));

// Mock the gateway model
jest.mock('../../../models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
}));

// Mock the gateway factory
jest.mock('../../../services/gateway/gateways/gateway-factory', () => ({
  GatewayFactory: {
    createFromConfig: jest.fn(),
  },
}));

describe('GatewayService', () => {
  let service: GatewayService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instance
    (GatewayService as any).instance = undefined;

    service = GatewayService.getInstance();
  });

  afterEach(() => {
    // Clean up
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
});