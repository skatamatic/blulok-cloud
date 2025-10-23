import { GatewayFactory } from '../../../services/gateway/gateways/gateway-factory';
import { ProtocolVersion, IGateway } from '../../../types/gateway.types';
import { SimulatedGateway } from '../../../services/gateway/gateways/simulated.gateway';
import { HttpGateway } from '../../../services/gateway/gateways/http.gateway';

// Mock the gateway classes
jest.mock('../../../services/gateway/gateways/simulated.gateway');
jest.mock('../../../services/gateway/gateways/http.gateway');
jest.mock('../../../services/gateway/gateways/physical.gateway');

const MockSimulatedGateway = SimulatedGateway as jest.MockedClass<typeof SimulatedGateway>;
const MockHttpGateway = HttpGateway as jest.MockedClass<typeof HttpGateway>;

describe('GatewayFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPhysicalGateway', () => {
    it('should create physical gateway with correct parameters', () => {
      const gatewayId = 'physical-gw-1';
      const facilityId = 'facility-1';
      const connectionUrl = 'ws://192.168.1.100:8080';
      const protocolVersion = ProtocolVersion.V1_1;

      // Mock the constructor
      const mockGatewayInstance = {
        id: gatewayId,
        facilityId,
        protocolVersion,
      } as IGateway;

      // Import and mock the physical gateway
      const { PhysicalGateway } = require('../../../services/gateway/gateways/physical.gateway');
      const MockPhysicalGateway = PhysicalGateway as jest.MockedClass<any>;
      MockPhysicalGateway.mockImplementation(() => mockGatewayInstance);

      const result = GatewayFactory.createPhysicalGateway(
        gatewayId,
        facilityId,
        connectionUrl,
        protocolVersion
      );

      expect(MockPhysicalGateway).toHaveBeenCalledWith(
        gatewayId,
        facilityId,
        connectionUrl,
        protocolVersion,
        'v1'
      );
      expect(result).toBe(mockGatewayInstance);
    });

    it('should use default protocol version when not specified', () => {
      const { PhysicalGateway } = require('../../../services/gateway/gateways/physical.gateway');
      const MockPhysicalGateway = PhysicalGateway as jest.MockedClass<any>;

      GatewayFactory.createPhysicalGateway('gw1', 'facility1', 'ws://test');

      expect(MockPhysicalGateway).toHaveBeenCalledWith(
        'gw1',
        'facility1',
        'ws://test',
        ProtocolVersion.V1_1,
        'v1'
      );
    });
  });

  describe('createHttpGateway', () => {
    it('should create HTTP gateway with all parameters', () => {
      const config = {
        id: 'http-gw-1',
        facilityId: 'facility-1',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-api-key',
        username: 'admin',
        password: 'secret',
        protocolVersion: ProtocolVersion.V1_1,
      };

      const mockGatewayInstance = {
        id: config.id,
        facilityId: config.facilityId,
        protocolVersion: config.protocolVersion,
      } as IGateway;

      MockHttpGateway.mockImplementation((_id, _facilityId, _baseUrl, _apiKey, _protocolVersion, _pollFrequencyMs, _keyManagementVersion, _ignoreSslCert) => mockGatewayInstance as any);

      const result = GatewayFactory.createHttpGateway(
        config.id,
        config.facilityId,
        config.baseUrl,
        config.apiKey,
        config.protocolVersion
      );

      expect(MockHttpGateway).toHaveBeenCalledWith(
        config.id,
        config.facilityId,
        config.baseUrl,
        config.apiKey,
        config.protocolVersion,
        undefined,
        'v1',
        false
      );
      expect(result).toBe(mockGatewayInstance);
    });

    it('should use default values for optional parameters', () => {
      const mockGatewayInstance = {
        id: 'http-gw-2',
        facilityId: 'facility-2',
      } as IGateway;

      MockHttpGateway.mockImplementation((_id, _facilityId, _baseUrl, _apiKey, _protocolVersion, _pollFrequencyMs, _keyManagementVersion, _ignoreSslCert) => mockGatewayInstance as any);

      GatewayFactory.createHttpGateway(
        'http-gw-2',
        'facility-2',
        'https://api.test.com',
        'api-key'
      );

      expect(MockHttpGateway).toHaveBeenCalledWith(
        'http-gw-2',
        'facility-2',
        'https://api.test.com',
        'api-key',
        ProtocolVersion.V1_1, // default protocol
        undefined, // default poll frequency
        'v1', // default key management version
        false // default ignore ssl cert
      );
    });
  });

  describe('createSimulatedGateway', () => {
    it('should create simulated gateway', () => {
      const config = {
        id: 'sim-gw-1',
        facilityId: 'facility-1',
        protocolVersion: ProtocolVersion.SIMULATED,
      };

      const mockGatewayInstance = {
        id: config.id,
        facilityId: config.facilityId,
        protocolVersion: config.protocolVersion,
      } as IGateway;

      MockSimulatedGateway.mockImplementation((_id, _facilityId, _protocolVersion) => mockGatewayInstance as any);

      const result = GatewayFactory.createSimulatedGateway(
        config.id,
        config.facilityId,
        config.protocolVersion
      );

      expect(MockSimulatedGateway).toHaveBeenCalledWith(
        config.id,
        config.facilityId,
        config.protocolVersion,
        'v1'
      );
      expect(result).toBe(mockGatewayInstance);
    });

    it('should use default simulated protocol version', () => {
      const mockGatewayInstance = {
        id: 'sim-gw-2',
        facilityId: 'facility-2',
      } as IGateway;

      MockSimulatedGateway.mockImplementation((_id, _facilityId, _protocolVersion) => mockGatewayInstance as any);

      GatewayFactory.createSimulatedGateway('sim-gw-2', 'facility-2');

      expect(MockSimulatedGateway).toHaveBeenCalledWith(
        'sim-gw-2',
        'facility-2',
        ProtocolVersion.SIMULATED,
        'v1'
      );
    });
  });

  describe('createFromConfig', () => {
    it('should create physical gateway from config', () => {
      const config = {
        id: 'physical-gw',
        facilityId: 'facility-1',
        type: 'physical' as const,
        connectionUrl: 'ws://192.168.1.100:8080',
        protocolVersion: ProtocolVersion.V1_1,
      };

      const { PhysicalGateway } = require('../../../services/gateway/gateways/physical.gateway');
      const MockPhysicalGateway = PhysicalGateway as jest.MockedClass<any>;
      const mockGatewayInstance = { id: config.id } as IGateway;
      MockPhysicalGateway.mockImplementation(() => mockGatewayInstance);

      const result = GatewayFactory.createFromConfig(config);

      expect(MockPhysicalGateway).toHaveBeenCalledWith(
        config.id,
        config.facilityId,
        config.connectionUrl,
        config.protocolVersion,
        'v1'
      );
      expect(result).toBe(mockGatewayInstance);
    });

    it('should create HTTP gateway from config', () => {
      const config = {
        id: 'http-gw',
        facilityId: 'facility-1',
        type: 'http' as const,
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        username: 'user',
        password: 'pass',
        protocolVersion: ProtocolVersion.V1_1,
      };

      const mockGatewayInstance = { id: config.id } as IGateway;
      MockHttpGateway.mockImplementation((_id, _facilityId, _baseUrl, _apiKey, _protocolVersion, _pollFrequencyMs, _keyManagementVersion, _ignoreSslCert) => mockGatewayInstance as any);

      const result = GatewayFactory.createFromConfig(config);

      expect(MockHttpGateway).toHaveBeenCalledWith(
        config.id,
        config.facilityId,
        config.baseUrl,
        config.apiKey,
        config.protocolVersion,
        undefined,
        'v1',
        false
      );
      expect(result).toBe(mockGatewayInstance);
    });

    it('should create simulated gateway from config', () => {
      const config = {
        id: 'sim-gw',
        facilityId: 'facility-1',
        type: 'simulated' as const,
        protocolVersion: ProtocolVersion.SIMULATED,
      };

      const mockGatewayInstance = { id: config.id } as IGateway;
      MockSimulatedGateway.mockImplementation((_id, _facilityId, _protocolVersion) => mockGatewayInstance as any);

      const result = GatewayFactory.createFromConfig(config);

      expect(MockSimulatedGateway).toHaveBeenCalledWith(
        config.id,
        config.facilityId,
        config.protocolVersion,
        'v1'
      );
      expect(result).toBe(mockGatewayInstance);
    });

    it('should throw error for physical gateway without connection URL', () => {
      const config = {
        id: 'physical-gw',
        facilityId: 'facility-1',
        type: 'physical' as const,
        // missing connectionUrl
      };

      expect(() => GatewayFactory.createFromConfig(config)).toThrow(
        'Connection URL is required for physical gateways'
      );
    });

    it('should throw error for HTTP gateway without base URL or API key', () => {
      const config = {
        id: 'http-gw',
        facilityId: 'facility-1',
        type: 'http' as const,
        // missing baseUrl and apiKey
      };

      expect(() => GatewayFactory.createFromConfig(config)).toThrow(
        'Base URL and API key are required for HTTP gateways'
      );
    });

    it('should throw error for unknown gateway type', () => {
      const config = {
        id: 'unknown-gw',
        facilityId: 'facility-1',
        type: 'unknown' as any,
      };

      expect(() => GatewayFactory.createFromConfig(config)).toThrow(
        'Unsupported gateway type: unknown'
      );
    });

    it('should handle undefined optional parameters', () => {
      const config = {
        id: 'http-gw',
        facilityId: 'facility-1',
        type: 'http' as const,
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        // username, password, protocolVersion are undefined
      };

      const mockGatewayInstance = { id: config.id } as IGateway;
      MockHttpGateway.mockImplementation((_id, _facilityId, _baseUrl, _apiKey, _protocolVersion, _pollFrequencyMs, _keyManagementVersion, _ignoreSslCert) => mockGatewayInstance as any);

      const result = GatewayFactory.createFromConfig(config);

      expect(MockHttpGateway).toHaveBeenCalledWith(
        config.id,
        config.facilityId,
        config.baseUrl,
        config.apiKey,
        ProtocolVersion.V1_1, // default protocolVersion
        undefined, // default poll frequency
        'v1', // default key management version
        false // default ignore ssl cert
      );
      expect(result).toBe(mockGatewayInstance);
    });
  });

  describe('getSupportedTypes', () => {
    it('should return all supported gateway types', () => {
      const supportedTypes = GatewayFactory.getSupportedTypes();

      expect(supportedTypes).toEqual(['physical', 'http', 'simulated']);
      expect(supportedTypes).toContain('physical');
      expect(supportedTypes).toContain('http');
      expect(supportedTypes).toContain('simulated');
    });
  });

  describe('Error Handling', () => {
    // Gateway constructor error handling is tested at the individual gateway level

    it('should create gateways with minimal required parameters', () => {
      const physical = GatewayFactory.createPhysicalGateway('gw1', 'facility1', 'ws://test');
      expect(physical).toBeDefined();

      const http = GatewayFactory.createHttpGateway('gw2', 'facility2', 'http://test', 'key');
      expect(http).toBeDefined();
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid parameters', () => {
      const mockGateway = {
        id: 'valid-id',
        facilityId: 'valid-facility',
        protocolVersion: ProtocolVersion.SIMULATED,
      };

      MockSimulatedGateway.mockImplementation(() => mockGateway as any);

      const gateway = GatewayFactory.createSimulatedGateway('valid-id', 'valid-facility');
      expect(gateway).toBeDefined();
      expect(gateway.id).toBe('valid-id');
      expect(gateway.facilityId).toBe('valid-facility');
    });

    it('should handle null/undefined parameters gracefully', () => {
      const config = {
        id: 'test-gw',
        facilityId: 'test-facility',
        type: 'simulated' as const,
        protocolVersion: undefined as any,
      };

      const mockGatewayInstance = { id: config.id } as IGateway;
      MockSimulatedGateway.mockImplementation((_id, _facilityId, _protocolVersion) => mockGatewayInstance as any);

      const result = GatewayFactory.createFromConfig(config);
      expect(result).toBeDefined();
    });
  });

  describe('Factory Consistency', () => {
    it('should create identical gateways with same parameters', () => {
      const config1 = {
        id: 'gw1',
        facilityId: 'facility1',
        type: 'simulated' as const,
      };

      const config2 = {
        id: 'gw2',
        facilityId: 'facility1',
        type: 'simulated' as const,
      };

      const mockGateway1 = { id: 'gw1' } as IGateway;
      const mockGateway2 = { id: 'gw2' } as IGateway;

      MockSimulatedGateway
        .mockImplementationOnce(() => mockGateway1 as any)
        .mockImplementationOnce(() => mockGateway2 as any);

      const gateway1 = GatewayFactory.createFromConfig(config1);
      const gateway2 = GatewayFactory.createFromConfig(config2);

      expect(gateway1.id).toBe('gw1');
      expect(gateway2.id).toBe('gw2');
      expect(MockSimulatedGateway).toHaveBeenCalledTimes(2);
    });

    it('should maintain factory method signatures', () => {
      // Test that all factory methods have consistent signatures
      expect(typeof GatewayFactory.createPhysicalGateway).toBe('function');
      expect(typeof GatewayFactory.createHttpGateway).toBe('function');
      expect(typeof GatewayFactory.createSimulatedGateway).toBe('function');
      expect(typeof GatewayFactory.createFromConfig).toBe('function');
      expect(typeof GatewayFactory.getSupportedTypes).toBe('function');
    });
  });

  describe('Type Safety', () => {
    it('should return correct gateway types', () => {
      const mockPhysicalGateway = { id: 'physical' } as IGateway;
      const mockHttpGateway = { id: 'http' } as IGateway;
      const mockSimulatedGateway = { id: 'simulated' } as IGateway;

      const { PhysicalGateway } = require('../../../services/gateway/gateways/physical.gateway');
      const MockPhysicalGateway = PhysicalGateway as jest.MockedClass<any>;

      MockPhysicalGateway.mockImplementation(() => mockPhysicalGateway);
      MockHttpGateway.mockImplementation(() => mockHttpGateway as any);
      MockSimulatedGateway.mockImplementation(() => mockSimulatedGateway as any);

      const physical = GatewayFactory.createPhysicalGateway('1', 'facility', 'ws://test');
      const http = GatewayFactory.createHttpGateway('2', 'facility', 'http://test', 'key');
      const simulated = GatewayFactory.createSimulatedGateway('3', 'facility');

      expect(physical).toBe(mockPhysicalGateway);
      expect(http).toBe(mockHttpGateway);
      expect(simulated).toBe(mockSimulatedGateway);
    });

    it('should handle protocol version type safety', () => {
      const config = {
        id: 'gw',
        facilityId: 'facility',
        type: 'simulated' as const,
        protocolVersion: 'invalid-protocol' as any, // This should be caught
      };

      // The factory should handle invalid protocol versions gracefully
      // or pass them through to the gateway constructor
      const mockGatewayInstance = { id: config.id } as IGateway;
      MockSimulatedGateway.mockImplementation((_id, _facilityId, _protocolVersion) => mockGatewayInstance as any);

      const result = GatewayFactory.createFromConfig(config);
      expect(result).toBeDefined();
    });
  });

  describe('Integration with Real Gateway Types', () => {
    it('should work with real gateway constructors', () => {
      // Test that the factory calls real constructors correctly
      const { PhysicalGateway } = require('../../../services/gateway/gateways/physical.gateway');
      const MockPhysicalGateway = PhysicalGateway as jest.MockedClass<any>;

      GatewayFactory.createPhysicalGateway('real-gw', 'facility', 'ws://real');

      expect(MockPhysicalGateway).toHaveBeenCalledWith(
        'real-gw',
        'facility',
        'ws://real',
        ProtocolVersion.V1_1,
        'v1'
      );
    });
  });
});
