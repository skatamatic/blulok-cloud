import { BaseProtocol } from './base.protocol';
import { MessageType, ProtocolVersion } from '../../../types/gateway.types';

/**
 * Protocol V1.0 implementation
 * Basic JSON-based protocol for gateway communication
 */
export class ProtocolV1 extends BaseProtocol {
  public readonly version = ProtocolVersion.V1_0;

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
   * Get protocol-specific capabilities
   */
  public getCapabilities(): Record<string, any> {
    return {
      encryption: false,
      compression: false,
      batching: false,
      chunking: false,
      authentication: 'basic',
      maxMessageSize: 65536, // 64KB
      heartbeatInterval: 30000, // 30 seconds
      timeout: 10000, // 10 seconds
      retryAttempts: 3,
    };
  }
}

