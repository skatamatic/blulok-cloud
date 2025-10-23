import { ProtocolV1 } from '../../../services/gateway/protocols/protocol-v1';
import { ProtocolVersion, IGatewayMessage, MessageType, CommandPriority } from '../../../types/gateway.types';

describe('ProtocolV1', () => {
  let protocol: ProtocolV1;

  beforeEach(() => {
    jest.clearAllMocks();
    protocol = new ProtocolV1();
  });

  describe('Initialization', () => {
    it('should create protocol with correct version', () => {
      expect(protocol.version).toBe(ProtocolVersion.V1_0);
    });

    it('should have supported message types', () => {
      expect(protocol.supportedMessageTypes).toContain(MessageType.DEVICE_STATUS_REQUEST);
      expect(protocol.supportedMessageTypes).toContain(MessageType.HEARTBEAT);
    });
  });

  describe('Message Encoding/Decoding', () => {
    it('should encode messages to JSON strings', () => {
      const message: IGatewayMessage = {
        id: 'test-msg-1',
        type: MessageType.DEVICE_STATUS_REQUEST,
        source: 'cloud',
        destination: 'gateway-1',
        protocolVersion: ProtocolVersion.V1_0,
        timestamp: new Date('2023-01-01T00:00:00Z'),
        payload: { deviceId: 'device-1' },
        priority: CommandPriority.NORMAL,
      };

      const encoded = protocol.encodeMessage(message);
      expect(encoded).toBeInstanceOf(Buffer);

      const parsed = JSON.parse(encoded.toString());
      expect(parsed.type).toBe(MessageType.DEVICE_STATUS_REQUEST);
      expect(parsed.protocolVersion).toBe(ProtocolVersion.V1_0);
      expect(parsed.timestamp).toBe('2023-01-01T00:00:00.000Z'); // Should be ISO string
    });

    it('should decode JSON strings to messages', () => {
      const message: IGatewayMessage = {
        id: 'test-msg-2',
        type: MessageType.DEVICE_COMMAND,
        source: 'gateway-1',
        destination: 'cloud',
        protocolVersion: ProtocolVersion.V1_0,
        timestamp: new Date('2023-01-01T00:00:00Z'),
        payload: { command: 'open', lockId: 'lock-1' },
        priority: CommandPriority.HIGH,
      };

      const jsonString = JSON.stringify({
        ...message,
        timestamp: '2023-01-01T00:00:00.000Z',
      });
      const buffer = Buffer.from(jsonString);

      const decoded = protocol.decodeMessage(buffer);
      expect(decoded.type).toBe(MessageType.DEVICE_COMMAND);
      expect(decoded.payload.lockId).toBe('lock-1');
      expect(decoded.timestamp).toEqual(new Date('2023-01-01T00:00:00.000Z'));
    });
  });

  describe('Protocol Capabilities', () => {
    it('should return protocol capabilities', () => {
      const capabilities = protocol.getCapabilities();

      expect(capabilities).toBeDefined();
      expect(capabilities).toHaveProperty('encryption', false);
      expect(capabilities).toHaveProperty('maxMessageSize', 65536);
      expect(capabilities).toHaveProperty('heartbeatInterval', 30000);
    });
  });
});