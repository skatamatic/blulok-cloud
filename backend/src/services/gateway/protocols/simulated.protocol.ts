import { BaseProtocol } from './base.protocol';
import { MessageType, ProtocolVersion, IGatewayMessage } from '../../../types/gateway.types';

/**
 * Simulated protocol for testing and development
 * Provides realistic delays and responses for testing gateway behavior
 */
export class SimulatedProtocol extends BaseProtocol {
  public readonly version = ProtocolVersion.SIMULATED;

  public readonly supportedMessageTypes = [
    MessageType.DEVICE_STATUS_REQUEST,
    MessageType.DEVICE_STATUS_RESPONSE,
    MessageType.DEVICE_COMMAND,
    MessageType.DEVICE_COMMAND_RESPONSE,
    MessageType.KEY_ADD,
    MessageType.KEY_REMOVE,
    MessageType.KEY_LIST,
    MessageType.ACCESS_GRANT,
    MessageType.ACCESS_DENY,
    MessageType.FIRMWARE_UPDATE_REQUEST,
    MessageType.FIRMWARE_UPDATE_STATUS,
    MessageType.HEARTBEAT,
    MessageType.PING,
    MessageType.PONG,
    MessageType.ERROR,
  ];

  /**
   * Encode message with simulated processing
   */
  public override encodeMessage(message: IGatewayMessage): Buffer {
    // Simulate encoding delay (but synchronously for interface compliance)
    return Buffer.from(JSON.stringify(message));
  }

  /**
   * Decode message with simulated processing
   */
  public override decodeMessage(data: Buffer): IGatewayMessage {
    // Simulate decoding delay (but synchronously for interface compliance)
    return JSON.parse(data.toString());
  }

  /**
   * Get protocol-specific capabilities with simulation features
   */
  public getCapabilities(): Record<string, any> {
    return {
      encryption: false,
      compression: false,
      batching: false,
      chunking: false,
      authentication: 'none',
      maxMessageSize: 1048576, // 1MB for simulation
      heartbeatInterval: 5000, // 5 seconds for faster testing
      timeout: 5000, // 5 seconds for faster testing
      retryAttempts: 1,
      simulationMode: true,
      networkDelay: '10-100ms',
      reliability: 0.95, // 95% success rate for testing failures
    };
  }
}
