import { IGateway, ProtocolVersion } from '../../../types/gateway.types';
import { PhysicalGateway } from './physical.gateway';
import { SimulatedGateway } from './simulated.gateway';
import { HttpGateway } from './http.gateway';

/**
 * Gateway Factory
 *
 * Factory pattern implementation for creating and configuring gateway instances.
 * Provides centralized gateway instantiation with type safety and configuration validation.
 *
 * Key Features:
 * - Type-safe gateway creation methods
 * - Configuration-driven gateway instantiation
 * - Protocol and connection type abstraction
 * - Validation of required configuration parameters
 * - Support for multiple gateway implementations
 *
 * Supported Gateway Types:
 * - Physical: WebSocket-based direct device control
 * - HTTP: REST API-based cloud-managed gateways
 * - Simulated: Testing gateways with mock behavior
 *
 * Factory Methods:
 * - Direct creation methods for each gateway type
 * - Configuration-based creation from database records
 * - Parameter validation and error handling
 * - Type-safe configuration mapping
 *
 * Configuration Mapping:
 * - Database configuration fields → Gateway constructor parameters
 * - Protocol version and key management version handling
 * - Connection-specific parameters (URLs, credentials, certificates)
 * - Facility association and identification
 *
 * Security Considerations:
 * - Credential validation before gateway creation
 * - Secure parameter handling and storage
 * - Configuration sanitization and validation
 * - Audit logging of gateway creation events
 */
export class GatewayFactory {
  /**
   * Create a physical gateway
   */
  public static createPhysicalGateway(
    id: string,
    facilityId: string,
    connectionUrl: string,
    protocolVersion: ProtocolVersion = ProtocolVersion.V1_1,
    keyManagementVersion: 'v1' | 'v2' = 'v1'
  ): IGateway {
    return new PhysicalGateway(id, facilityId, connectionUrl, protocolVersion, keyManagementVersion);
  }

  /**
   * Create an HTTP-based gateway for the Mesh Manager API
   */
  public static createHttpGateway(
    id: string,
    facilityId: string,
    baseUrl: string,
    apiKey: string,
    protocolVersion: ProtocolVersion = ProtocolVersion.V1_1,
    pollFrequencyMs?: number,
    keyManagementVersion: 'v1' | 'v2' = 'v1',
    ignoreSslCert: boolean = false
  ): IGateway {
    return new HttpGateway(id, facilityId, baseUrl, apiKey, protocolVersion, pollFrequencyMs, keyManagementVersion, ignoreSslCert);
  }

  /**
   * Create a simulated gateway for testing
   */
  public static createSimulatedGateway(
    id: string,
    facilityId: string,
    protocolVersion: ProtocolVersion = ProtocolVersion.SIMULATED,
    keyManagementVersion: 'v1' | 'v2' = 'v1'
  ): IGateway {
    return new SimulatedGateway(id, facilityId, protocolVersion, keyManagementVersion);
  }

  /**
   * Create gateway from configuration
   */
  public static createFromConfig(config: {
    id: string;
    facilityId: string;
    type: 'physical' | 'http' | 'simulated';
    keyManagementVersion?: 'v1' | 'v2';
    connectionUrl?: string;
    baseUrl?: string;
    apiKey?: string;
    protocolVersion?: ProtocolVersion;
    poll_frequency_ms?: number;
    ignore_ssl_cert?: boolean;
  }): IGateway {
    switch (config.type) {
      case 'physical':
        if (!config.connectionUrl) {
          throw new Error('Connection URL is required for physical gateways');
        }
        return this.createPhysicalGateway(
          config.id,
          config.facilityId,
          config.connectionUrl,
          config.protocolVersion,
          config.keyManagementVersion
        );

      case 'http':
        if (!config.baseUrl || !config.apiKey) {
          throw new Error('Base URL and API key are required for HTTP gateways');
        }
        return this.createHttpGateway(
          config.id,
          config.facilityId,
          config.baseUrl,
          config.apiKey,
          config.protocolVersion,
          config.poll_frequency_ms,
          config.keyManagementVersion,
          config.ignore_ssl_cert
        );

      case 'simulated':
        return this.createSimulatedGateway(
          config.id,
          config.facilityId,
          config.protocolVersion,
          config.keyManagementVersion
        );

      default:
        throw new Error(`Unsupported gateway type: ${config.type}`);
    }
  }

  /**
   * Get supported gateway types
   */
  public static getSupportedTypes(): string[] {
    return ['physical', 'http', 'simulated'];
  }
}
