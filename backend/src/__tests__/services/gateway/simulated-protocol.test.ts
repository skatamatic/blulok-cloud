import { SimulatedProtocol } from '../../../services/gateway/protocols/simulated.protocol';
import { ProtocolVersion, IGatewayMessage, MessageType, CommandPriority } from '../../../types/gateway.types';

describe('SimulatedProtocol', () => {
  let protocol: SimulatedProtocol;

  beforeEach(() => {
    protocol = new SimulatedProtocol();
  });

  describe('Initialization', () => {
    it('should create protocol with SIMULATED version', () => {
      expect(protocol.version).toBe(ProtocolVersion.SIMULATED);
    });

    it('should have supported message types', () => {
      expect(protocol.supportedMessageTypes).toBeDefined();
      expect(Array.isArray(protocol.supportedMessageTypes)).toBe(true);
      expect(protocol.supportedMessageTypes.length).toBeGreaterThan(0);
    });
  });

  describe('Message Encoding/Decoding', () => {
    it('should encode messages to JSON strings', () => {
      const message: IGatewayMessage = {
        id: 'test-msg-1',
        type: MessageType.DEVICE_STATUS_REQUEST,
        source: 'cloud',
        destination: 'gateway-1',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: { deviceId: 'device-1' },
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(message);
      expect(encoded).toBeInstanceOf(Buffer);

      const parsed = JSON.parse(encoded.toString());
      // Check individual properties since JSON serialization converts Date to string
      expect(parsed.id).toBe(message.id);
      expect(parsed.type).toBe(message.type);
      expect(parsed.source).toBe(message.source);
      expect(parsed.destination).toBe(message.destination);
      expect(parsed.protocolVersion).toBe(message.protocolVersion);
      expect(parsed.payload).toEqual(message.payload);
      expect(parsed.priority).toBe(message.priority);
    });

    it('should decode JSON strings to messages', () => {
      const originalMessage: IGatewayMessage = {
        id: 'test-msg-2',
        type: MessageType.DEVICE_COMMAND,
        source: 'gateway-1',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: { command: 'open', lockId: 'lock-1' },
        priority: CommandPriority.HIGH,
      };

      const jsonString = JSON.stringify(originalMessage);
      const buffer = Buffer.from(jsonString);

      const decoded = protocol.decodeMessage(buffer);
      expect(decoded.id).toBe(originalMessage.id);
      expect(decoded.type).toBe(originalMessage.type);
      expect(decoded.source).toBe(originalMessage.source);
      expect(decoded.destination).toBe(originalMessage.destination);
      expect(decoded.protocolVersion).toBe(originalMessage.protocolVersion);
      expect(decoded.payload).toEqual(originalMessage.payload);
      expect(decoded.priority).toBe(originalMessage.priority);
      expect(new Date(decoded.timestamp as any).toISOString()).toBe(originalMessage.timestamp.toISOString());
    });

    it('should handle complex payloads', () => {
      const complexMessage: IGatewayMessage = {
        id: 'complex-msg',
        type: MessageType.KEY_ADD,
        source: 'cloud',
        destination: 'gateway-1',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: {
          lockId: 'lock-123',
          keyData: {
            key_code: 'ABC123',
            key_secret: 'secret456',
            key_token: 'token789',
            revision: 42,
            expires_at: new Date('2025-01-01'),
          },
        },
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(complexMessage);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.id).toBe(complexMessage.id);
      expect(decoded.type).toBe(complexMessage.type);
      expect(decoded.payload.lockId).toBe(complexMessage.payload.lockId);
      expect(decoded.payload.keyData.key_code).toBe(complexMessage.payload.keyData.key_code);
      expect(new Date(decoded.timestamp as any).toISOString()).toBe(complexMessage.timestamp.toISOString());
    });

    it('should handle messages with undefined correlationId', () => {
      const message: IGatewayMessage = {
        id: 'test-msg-3',
        type: MessageType.HEARTBEAT,
        source: 'gateway-1',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: {},
        priority: CommandPriority.LOW,
        // correlationId is undefined
      };

      const encoded = protocol.encodeMessage(message);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.correlationId).toBeUndefined();
    });
  });

  describe('Message Validation', () => {
    it('should validate well-formed messages', () => {
      const validMessage: IGatewayMessage = {
        id: 'valid-msg',
        type: MessageType.DEVICE_STATUS_REQUEST,
        source: 'cloud',
        destination: 'gateway-1',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: { deviceId: 'device-1' },
        priority: CommandPriority.NORMAL,
      };

      const isValid = protocol.validateMessage(validMessage);
      expect(isValid).toBe(true);
    });

    it('should reject messages with missing required fields', () => {
      const invalidMessage = {
        // Missing id, type, source, destination, etc.
        payload: { someData: 'test' },
      } as any;

      const isValid = protocol.validateMessage(invalidMessage);
      expect(isValid).toBe(false);
    });

    it('should reject messages with invalid timestamp', () => {
      const invalidTimestampMessage: IGatewayMessage = {
        id: 'invalid-timestamp',
        type: MessageType.HEARTBEAT,
        source: 'gateway',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('invalid'), // Invalid date
        payload: {},
        priority: CommandPriority.LOW,
      };

      const isValid = protocol.validateMessage(invalidTimestampMessage);
      expect(isValid).toBe(false);
    });

    it('should accept messages with optional fields', () => {
      const messageWithOptionals: IGatewayMessage = {
        id: 'optional-msg',
        type: MessageType.DEVICE_STATUS_RESPONSE,
        source: 'gateway-1',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: { status: 'online' },
        priority: CommandPriority.NORMAL,
        correlationId: 'correlation-123',
        timeout: 5000,
      };

      const isValid = protocol.validateMessage(messageWithOptionals);
      expect(isValid).toBe(true);
    });
  });

  describe('Protocol Capabilities', () => {
    it('should return protocol capabilities', () => {
      const capabilities = protocol.getCapabilities();

      expect(capabilities).toBeDefined();
      expect(typeof capabilities).toBe('object');
      expect(capabilities).toHaveProperty('simulationMode');
      expect(capabilities).toHaveProperty('networkDelay');
    });

    it('should include simulation-specific capabilities', () => {
      const capabilities = protocol.getCapabilities();

      expect(capabilities.simulationMode).toBe(true);
      expect(capabilities).toHaveProperty('reliability', 0.95);
      expect(capabilities).toHaveProperty('timeout', 5000);
    });
  });

  // Note: SimulatedProtocol focuses on message encoding/decoding and validation
  // Command execution is handled at the gateway level, not protocol level

  describe('Error Handling', () => {
    it('should handle invalid JSON in decodeMessage', () => {
      const invalidBuffer = Buffer.from('invalid json');

      expect(() => {
        protocol.decodeMessage(invalidBuffer);
      }).toThrow(SyntaxError);
    });

    it('should handle empty buffer in decodeMessage', () => {
      const emptyBuffer = Buffer.from('');

      expect(() => {
        protocol.decodeMessage(emptyBuffer);
      }).toThrow(SyntaxError);
    });

    it('should handle null/undefined payloads', () => {
      const messageWithNullPayload: IGatewayMessage = {
        id: 'null-payload',
        type: MessageType.HEARTBEAT,
        source: 'gateway',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: null as any,
        priority: CommandPriority.LOW,
      };

      const encoded = protocol.encodeMessage(messageWithNullPayload);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.payload).toBeNull();
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle large messages', () => {
      const largePayload = {
        data: 'x'.repeat(10000), // 10KB of data
        array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() })),
      };

      const message: IGatewayMessage = {
        id: 'large-msg',
        type: MessageType.DEVICE_COMMAND,
        source: 'cloud',
        destination: 'gateway',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: largePayload,
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(message);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.payload.data.length).toBe(10000);
      expect(decoded.payload.array.length).toBe(1000);
    });

    it('should handle rapid encoding/decoding', () => {
      const messages: IGatewayMessage[] = [];

      // Create 100 messages
      for (let i = 0; i < 100; i++) {
        messages.push({
          id: `msg-${i}`,
          type: MessageType.DEVICE_STATUS_REQUEST,
          source: 'cloud',
          destination: 'gateway',
          protocolVersion: ProtocolVersion.SIMULATED,
          timestamp: new Date('2023-01-01T00:00:00.000Z'),
          payload: { deviceId: `device-${i}` },
          priority: CommandPriority.NORMAL,
        });
      }

      // Encode and decode all messages
      const encodedMessages = messages.map(msg => protocol.encodeMessage(msg));
      const decodedMessages = encodedMessages.map(buf =>
        protocol.decodeMessage(Buffer.from(buf.toString()))
      );

      // Check that all messages have the same structure and content
      expect(decodedMessages.length).toBe(messages.length);
      decodedMessages.forEach((decoded, i) => {
        const original = messages[i];
        expect(decoded).toBeDefined();
        expect(original).toBeDefined();
        expect(decoded!.id).toBe(original!.id);
        expect(decoded!.type).toBe(original!.type);
        expect(decoded!.payload.deviceId).toBe(original!.payload.deviceId);
        expect(new Date(decoded!.timestamp as any).getTime()).toBe(original!.timestamp.getTime());
      });
    });

    it('should maintain data integrity through encode/decode cycle', () => {
      const originalData = {
        string: 'hello world',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3, 'four'],
        object: {
          nested: {
            value: 'deep',
            count: 5,
          },
        },
        date: '2023-01-01T00:00:00.000Z', // JSON serializes dates as strings
      };

      const message: IGatewayMessage = {
        id: 'integrity-test',
        type: MessageType.DEVICE_COMMAND,
        source: 'cloud',
        destination: 'gateway',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: originalData,
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(message);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.payload).toEqual(originalData);
      expect(decoded.payload.date).toBe('2023-01-01T00:00:00.000Z');
    });
  });

  describe('Protocol Version Consistency', () => {
    it('should always use SIMULATED protocol version', () => {
      expect(protocol.version).toBe(ProtocolVersion.SIMULATED);
    });

    it('should validate messages with SIMULATED protocol version', () => {
      const message: IGatewayMessage = {
        id: 'version-test',
        type: MessageType.HEARTBEAT,
        source: 'gateway',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: {},
        priority: CommandPriority.LOW,
      };

      const isValid = protocol.validateMessage(message);
      expect(isValid).toBe(true);
    });

  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const emptyMessage: IGatewayMessage = {
        id: '',
        type: MessageType.HEARTBEAT,
        source: '',
        destination: '',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: {},
        priority: CommandPriority.LOW,
      };

      const encoded = protocol.encodeMessage(emptyMessage);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.id).toBe(emptyMessage.id);
      expect(decoded.type).toBe(emptyMessage.type);
      expect(new Date(decoded.timestamp as any).toISOString()).toBe(emptyMessage.timestamp.toISOString());
    });

    it('should handle special characters in strings', () => {
      const specialMessage: IGatewayMessage = {
        id: 'special-!@#$%^&*()',
        type: MessageType.DEVICE_COMMAND,
        source: 'gateway-ñ',
        destination: 'cloud-测试',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: {
          command: 'open',
          lockId: 'lock-!@#',
          note: 'Special chars: àáâãäåæçèéêë',
        },
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(specialMessage);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      expect(decoded.id).toBe(specialMessage.id);
      expect(decoded.type).toBe(specialMessage.type);
      expect(decoded.payload.note).toBe(specialMessage.payload.note);
      expect(new Date(decoded.timestamp as any).toISOString()).toBe(specialMessage.timestamp.toISOString());
    });

    it('should handle circular references gracefully', () => {
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj;

      const message: IGatewayMessage = {
        id: 'circular-test',
        type: MessageType.DEVICE_COMMAND,
        source: 'cloud',
        destination: 'gateway',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: circularObj,
        priority: CommandPriority.NORMAL,
      };

      // JSON.stringify will throw on circular references
      expect(() => {
        protocol.encodeMessage(message);
      }).toThrow(TypeError);
    });

    it('should handle very deep nesting', () => {
      let deepObj: any = {};
      let current = deepObj;
      for (let i = 0; i < 100; i++) {
        current.nested = {};
        current = current.nested;
      }
      current.value = 'deepest';

      const message: IGatewayMessage = {
        id: 'deep-test',
        type: MessageType.DEVICE_COMMAND,
        source: 'cloud',
        destination: 'gateway',
        protocolVersion: ProtocolVersion.SIMULATED,
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
        payload: deepObj,
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(message);
      const decoded = protocol.decodeMessage(Buffer.from(encoded.toString()));

      let check = decoded.payload;
      for (let i = 0; i < 100; i++) {
        check = check.nested;
      }
      expect(check.value).toBe('deepest');
    });
  });
});
