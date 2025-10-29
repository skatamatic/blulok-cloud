import { BaseGateway } from './base.gateway';
import { IGatewayCapabilities, IDeviceInfo, DeviceType, ProtocolVersion, MessageType, CommandPriority } from '../../../types/gateway.types';
import { IProtocol } from '../../../types/gateway.types';
import { IGatewayConnection } from '../../../types/gateway.types';
import { ProtocolFactory } from '../protocols/protocol-factory';
import { WebSocketConnection } from '../connections/websocket.connection';

/**
 * Physical Gateway Implementation
 *
 * Production-ready gateway implementation for real hardware communication with on-site facilities.
 * Provides direct device control through persistent WebSocket connections to physical gateways.
 *
 * Key Features:
 * - WebSocket-based real-time communication with physical gateways
 * - Direct device control and monitoring capabilities
 * - Firmware update support for remote maintenance
 * - Comprehensive device type support (locks, access control, sensors, cameras)
 * - Remote access control with key management
 * - Heartbeat monitoring for connection health
 *
 * Communication Architecture:
 * - Persistent WebSocket connections to physical gateway hardware
 * - Protocol abstraction for different communication versions
 * - Message framing and command execution
 * - Real-time device status updates and telemetry
 * - Secure command delivery and response handling
 *
 * Device Support:
 * - Smart locks with access control
 * - Access control panels and readers
 * - Environmental sensors and monitoring devices
 * - Security cameras and intercom systems
 * - Multi-device coordination and orchestration
 *
 * Security Considerations:
 * - WSS (WebSocket Secure) connections required
 * - Authentication and authorization for gateway access
 * - Encrypted command and response communication
 * - Secure firmware update mechanisms
 * - Audit logging for all device operations
 */
export class PhysicalGateway extends BaseGateway {
  constructor(
    id: string,
    facilityId: string,
    private readonly connectionUrl: string,
    protocolVersion: ProtocolVersion = ProtocolVersion.V1_1,
    keyManagementVersion: 'v1' | 'v2' = 'v1'
  ) {
    super(id, facilityId, protocolVersion, keyManagementVersion);
  }

  /**
   * Get gateway capabilities
   */
  public get capabilities(): IGatewayCapabilities {
    return {
      supportedProtocols: [ProtocolVersion.V1_0, ProtocolVersion.V1_1],
      maxConnections: 1,
      supportedDeviceTypes: [
        DeviceType.LOCK,
        DeviceType.ACCESS_CONTROL,
        DeviceType.SENSOR,
        DeviceType.CAMERA,
        DeviceType.INTERCOM,
      ],
      firmwareUpdateSupport: true,
      remoteAccessSupport: true,
      keyManagementSupport: true,
      heartbeatInterval: 30000, // 30 seconds
    };
  }

  /**
   * Create protocol instance
   */
  protected createProtocol(): IProtocol {
    return ProtocolFactory.createProtocol(this.protocolVersion);
  }

  /**
   * Create connection instance
   */
  protected createConnection(): IGatewayConnection {
    return new WebSocketConnection(
      this.id,
      this.connectionUrl,
      this.capabilities.heartbeatInterval,
      10000 // 10 second connection timeout
    );
  }

  /**
   * Send device registration to gateway
   */
  protected async sendDeviceRegistration(deviceInfo: IDeviceInfo): Promise<void> {
    const message = {
      id: `register-${deviceInfo.id}-${Date.now()}`,
      type: MessageType.DEVICE_COMMAND,
      source: 'cloud',
      destination: this.id,
      protocolVersion: this.protocolVersion,
      timestamp: new Date(),
      payload: {
        device: deviceInfo,
        action: 'register',
      },
      priority: CommandPriority.NORMAL,
    };

    await this.sendMessage(message);
  }

  /**
   * Send device unregistration to gateway
   */
  protected async sendDeviceUnregistration(deviceId: string): Promise<void> {
    const message = {
      id: `unregister-${deviceId}-${Date.now()}`,
      type: MessageType.DEVICE_COMMAND,
      source: 'cloud',
      destination: this.id,
      protocolVersion: this.protocolVersion,
      timestamp: new Date(),
      payload: {
        deviceId,
        action: 'unregister',
      },
      priority: CommandPriority.NORMAL,
    };

    await this.sendMessage(message);
  }
}
