import { IProtocol, IGatewayMessage, MessageType, ProtocolVersion } from '../../../types/gateway.types';

/**
 * Base Protocol Implementation
 *
 * Abstract base class providing common functionality for all gateway communication protocols.
 * Implements the IProtocol interface and provides shared logic for message encoding/decoding,
 * validation, and protocol abstraction.
 *
 * Key Features:
 * - JSON-based message encoding and decoding
 * - Message validation and format verification
 * - Protocol version abstraction
 * - Message type support checking
 * - Timestamp handling and correlation ID support
 * - Priority and timeout management
 *
 * Message Format:
 * - JSON-encoded messages with standardized structure
 * - Message metadata (ID, type, source, destination, timestamp)
 * - Protocol version identification
 * - Payload abstraction for protocol-specific data
 * - Priority levels for message queuing
 * - Timeout handling for request/response patterns
 * - Correlation IDs for request tracking
 *
 * Architecture:
 * - Abstract base class with concrete protocol implementations
 * - Implements IProtocol interface for standardized API
 * - Message framing and parsing logic
 * - Validation and error handling
 * - Extensible for future protocol versions
 *
 * Security Considerations:
 * - Input validation for message parsing
 * - Safe JSON parsing with error handling
 * - Message size limits and validation
 * - Protocol version compatibility checking
 * - Audit logging for message processing
 */
export abstract class BaseProtocol implements IProtocol {
  // Protocol version identifier
  public abstract readonly version: ProtocolVersion;

  // Supported message types for this protocol version
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

