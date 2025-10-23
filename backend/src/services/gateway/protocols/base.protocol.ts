import { IProtocol, IGatewayMessage, MessageType, ProtocolVersion } from '../../../types/gateway.types';

/**
 * Base protocol implementation providing common functionality
 */
export abstract class BaseProtocol implements IProtocol {
  public abstract readonly version: ProtocolVersion;
  public abstract readonly supportedMessageTypes: MessageType[];

  /**
   * Encode a message for transmission
   */
  public encodeMessage(message: IGatewayMessage): Buffer {
    const payload = {
      id: message.id,
      type: message.type,
      source: message.source,
      destination: message.destination,
      protocolVersion: this.version,
      timestamp: message.timestamp.toISOString(),
      payload: message.payload,
      priority: message.priority,
      timeout: message.timeout,
      correlationId: message.correlationId,
    };

    return Buffer.from(JSON.stringify(payload), 'utf8');
  }

  /**
   * Decode a received message
   */
  public decodeMessage(data: Buffer): IGatewayMessage {
    const rawMessage = JSON.parse(data.toString('utf8'));

    return {
      id: rawMessage.id,
      type: rawMessage.type,
      source: rawMessage.source,
      destination: rawMessage.destination,
      protocolVersion: rawMessage.protocolVersion || this.version,
      timestamp: new Date(rawMessage.timestamp),
      payload: rawMessage.payload,
      priority: rawMessage.priority,
      timeout: rawMessage.timeout,
      correlationId: rawMessage.correlationId,
    };
  }

  /**
   * Validate message format
   */
  public validateMessage(message: IGatewayMessage): boolean {
    try {
      // Check required fields
      if (!message.id || !message.type || !message.source || !message.destination) {
        return false;
      }

      // Check if message type is supported
      if (!this.supportedMessageTypes.includes(message.type)) {
        return false;
      }

      // Check timestamp
      if (!(message.timestamp instanceof Date) || isNaN(message.timestamp.getTime())) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get protocol-specific capabilities
   */
  public abstract getCapabilities(): Record<string, any>;
}

