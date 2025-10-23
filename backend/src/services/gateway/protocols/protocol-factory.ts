import { IProtocol, ProtocolVersion } from '../../../types/gateway.types';
import { ProtocolV1 } from './protocol-v1';
import { SimulatedProtocol } from './simulated.protocol';

/**
 * Factory for creating protocol instances based on version
 */
export class ProtocolFactory {
  private static protocols = new Map<ProtocolVersion, IProtocol>();

  /**
   * Create a protocol instance for the specified version
   */
  public static createProtocol(version: ProtocolVersion): IProtocol {
    // Check cache first
    if (this.protocols.has(version)) {
      return this.protocols.get(version)!;
    }

    let protocol: IProtocol;

    switch (version) {
      case ProtocolVersion.V1_0:
      case ProtocolVersion.V1_1:
        protocol = new ProtocolV1();
        break;

      case ProtocolVersion.SIMULATED:
        protocol = new SimulatedProtocol();
        break;

      default:
        throw new Error(`Unsupported protocol version: ${version}`);
    }

    // Cache the protocol instance
    this.protocols.set(version, protocol);
    return protocol;
  }

  /**
   * Get all supported protocol versions
   */
  public static getSupportedVersions(): ProtocolVersion[] {
    return [
      ProtocolVersion.V1_0,
      ProtocolVersion.V1_1,
      ProtocolVersion.SIMULATED,
    ];
  }

  /**
   * Check if a protocol version is supported
   */
  public static isVersionSupported(version: ProtocolVersion): boolean {
    return this.getSupportedVersions().includes(version);
  }

  /**
   * Get the latest stable protocol version
   */
  public static getLatestVersion(): ProtocolVersion {
    return ProtocolVersion.V1_1;
  }

  /**
   * Clear protocol cache (useful for testing)
   */
  public static clearCache(): void {
    this.protocols.clear();
  }
}

