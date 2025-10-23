/**
 * Gateway and Device Management Types
 *
 * This module defines the core abstractions for managing gateways and devices
 * in the Blulok system. Gateways act as bridges between the cloud and physical
 * facilities, managing device communication, access control, and firmware updates.
 */

import { EventEmitter } from 'events';

/**
 * Gateway connection state
 */
export enum GatewayConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Device connection state
 */
export enum DeviceConnectionState {
  UNKNOWN = 'unknown',
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
}

/**
 * Device types
 */
export enum DeviceType {
  LOCK = 'lock',
  ACCESS_CONTROL = 'access_control',
  SENSOR = 'sensor',
  CAMERA = 'camera',
  INTERCOM = 'intercom',
}

/**
 * Access key types
 */
export enum KeyType {
  PHYSICAL = 'physical',
  DIGITAL = 'digital',
  TEMPORARY = 'temporary',
  MASTER = 'master',
}

/**
 * Protocol versions
 */
export enum ProtocolVersion {
  V1_0 = '1.0',
  V1_1 = '1.1',
  V2_0 = '2.0',
  SIMULATED = 'simulated',
}

/**
 * Message types for gateway communication
 */
export enum MessageType {
  // Device management
  DEVICE_STATUS_REQUEST = 'device_status_request',
  DEVICE_STATUS_RESPONSE = 'device_status_response',
  DEVICE_COMMAND = 'device_command',
  DEVICE_COMMAND_RESPONSE = 'device_command_response',

  // Access control
  KEY_ADD = 'key_add',
  KEY_REMOVE = 'key_remove',
  KEY_LIST = 'key_list',
  ACCESS_GRANT = 'access_grant',
  ACCESS_DENY = 'access_deny',

  // Firmware
  FIRMWARE_UPDATE_REQUEST = 'firmware_update_request',
  FIRMWARE_UPDATE_STATUS = 'firmware_update_status',
  FIRMWARE_UPDATE_CHUNK = 'firmware_update_chunk',

  // System
  HEARTBEAT = 'heartbeat',
  PING = 'ping',
  PONG = 'pong',
  ERROR = 'error',
}

/**
 * Command priority levels
 */
export enum CommandPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Gateway capabilities
 */
export interface IGatewayCapabilities {
  /** Supported protocol versions */
  supportedProtocols: ProtocolVersion[];

  /** Maximum concurrent connections */
  maxConnections: number;

  /** Supported device types */
  supportedDeviceTypes: DeviceType[];

  /** Firmware update capabilities */
  firmwareUpdateSupport: boolean;

  /** Remote access control support */
  remoteAccessSupport: boolean;

  /** Key management support */
  keyManagementSupport: boolean;

  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

/**
 * Device information
 */
export interface IDeviceInfo {
  /** Unique device identifier */
  id: string;

  /** Device type */
  type: DeviceType;

  /** Device model/version */
  model: string;

  /** Serial number */
  serialNumber: string;

  /** Firmware version */
  firmwareVersion: string;

  /** Hardware revision */
  hardwareRevision: string;

  /** Installation date */
  installedAt: Date;

  /** Last seen timestamp */
  lastSeen?: Date;

  /** Device-specific configuration */
  configuration: Record<string, any>;
}

/**
 * Access key information
 */
export interface IAccessKey {
  /** Unique key identifier */
  id: string;

  /** Key type */
  type: KeyType;

  /** Associated user ID */
  userId: string;

  /** Key data (encrypted) */
  keyData: string;

  /** Valid from timestamp */
  validFrom: Date;

  /** Valid until timestamp */
  validUntil?: Date;

  /** Key permissions */
  permissions: string[];

  /** Key status */
  isActive: boolean;

  /** Creation timestamp */
  createdAt: Date;

  /** Last used timestamp */
  lastUsedAt?: Date;
}

/**
 * Firmware update information
 */
export interface IFirmwareUpdate {
  /** Update identifier */
  id: string;

  /** Target firmware version */
  version: string;

  /** Firmware file checksum */
  checksum: string;

  /** Update size in bytes */
  size: number;

  /** Update priority */
  priority: 'low' | 'normal' | 'high' | 'critical';

  /** Update description */
  description: string;

  /** Release notes */
  releaseNotes?: string;

  /** Compatible device models */
  compatibleModels: string[];

  /** Minimum required firmware version */
  minimumVersion?: string;
}

/**
 * Gateway status information
 */
export interface IGatewayStatus {
  /** Gateway identifier */
  id: string;

  /** Connection state */
  connectionState: GatewayConnectionState;

  /** Last heartbeat timestamp */
  lastHeartbeat?: Date;

  /** Uptime in seconds */
  uptime?: number;

  /** Memory usage percentage */
  memoryUsage?: number;

  /** CPU usage percentage */
  cpuUsage?: number;

  /** Number of connected devices */
  deviceCount: number;

  /** Gateway version */
  version: string;

  /** Protocol version */
  protocolVersion: ProtocolVersion;

  /** Error message if in error state */
  errorMessage?: string;
}

/**
 * Device status information
 */
export interface IDeviceStatus {
  /** Device identifier */
  id: string;

  /** Connection state */
  connectionState: DeviceConnectionState;

  /** Device is locked/unlocked (for locks) */
  isLocked?: boolean;

  /** Battery level percentage */
  batteryLevel?: number;

  /** Signal strength */
  signalStrength?: number;

  /** Temperature (if applicable) */
  temperature?: number;

  /** Last activity timestamp */
  lastActivity?: Date;

  /** Error state */
  hasError: boolean;

  /** Error message */
  errorMessage?: string;
}

/**
 * Message envelope for gateway communication
 */
export interface IGatewayMessage {
  /** Unique message identifier */
  id: string;

  /** Message type */
  type: MessageType;

  /** Source identifier (gateway or cloud) */
  source: string;

  /** Destination identifier */
  destination: string;

  /** Protocol version */
  protocolVersion: ProtocolVersion;

  /** Message timestamp */
  timestamp: Date;

  /** Message payload */
  payload: any;

  /** Message priority */
  priority: CommandPriority;

  /** Expected response timeout in seconds */
  timeout?: number;

  /** Correlation ID for request/response matching */
  correlationId?: string;
}

/**
 * Command execution result
 */
export interface ICommandResult {
  /** Success status */
  success: boolean;

  /** Result data */
  data?: any;

  /** Error message if failed */
  error?: string;

  /** Execution timestamp */
  executedAt: Date;

  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Core Gateway interface
 */
export interface IGateway extends EventEmitter {
  /** Gateway identifier */
  readonly id: string;

  /** Gateway capabilities */
  readonly capabilities: IGatewayCapabilities;

  /** Current status */
  readonly status: IGatewayStatus;

  /** Associated facility ID */
  readonly facilityId: string;

  /** Protocol version */
  readonly protocolVersion: ProtocolVersion;

  /** Key management version (v1=Postman hex format, v2=ED25519 format) */
  readonly keyManagementVersion: 'v1' | 'v2';

  /** Initialize the gateway */
  initialize(): Promise<void>;

  /** Shutdown the gateway */
  shutdown(): Promise<void>;

  /** Connect to the gateway */
  connect(silent?: boolean): Promise<void>;

  /** Disconnect from the gateway */
  disconnect(silent?: boolean): Promise<void>;

  /** Send a message to the gateway */
  sendMessage(message: IGatewayMessage): Promise<void>;

  /** Register a device with the gateway */
  registerDevice(deviceInfo: IDeviceInfo): Promise<void>;

  /** Unregister a device from the gateway */
  unregisterDevice(deviceId: string): Promise<void>;

  /** Get device status */
  getDeviceStatus(deviceId: string): Promise<IDeviceStatus>;

  /** Execute a command on a device */
  executeDeviceCommand(deviceId: string, command: string, params?: any): Promise<ICommandResult>;

  /** Perform device synchronization */
  sync(updateStatus?: boolean): Promise<{
    devices: any[];
    syncResults: {
      devicesFound: number;
      devicesSynced: number;
      keysRetrieved: number;
      errors: string[];
    };
  }>;

  /** Add access key to device
   * v1: expects { revision, key_code?, key_counter?, key_secret, key_token }
   *     returns { success, data: { keyCode: number } }
   * v2: expects { public_key: string, user_id: string }
   *     returns { success }
   */
  addKey?(deviceId: string, keyData: any): Promise<ICommandResult>;

  /** Revoke access key from device
   * v1: revoke by keyCode (number)
   * v2: revoke by public_key (string) with keyCode ignored
   */
  revokeKey?(deviceId: string, keyCode: number, publicKey?: string): Promise<ICommandResult>;

  /** Get keys for device */
  getKeys?(deviceId: string): Promise<any[]>;

  /** Get all locks/devices */
  getAllLocks?(): Promise<any[]>;

  /** Send FCM message */
  sendFCMMessage?(token: string, data: any): Promise<ICommandResult>;

  /** Perform device synchronization */
  sync(): Promise<void | {
    devices: any[];
    syncResults: {
      devicesFound: number;
      devicesSynced: number;
      keysRetrieved: number;
      errors: string[];
    };
  }>;
}

/**
 * Core Device interface
 */
export interface IDevice {
  /** Device information */
  readonly info: IDeviceInfo;

  /** Current status */
  readonly status: IDeviceStatus;

  /** Associated gateway ID */
  readonly gatewayId: string;

  /** Execute a command on this device */
  executeCommand(command: string, params?: any): Promise<ICommandResult>;

  /** Get current device status */
  getStatus(): Promise<IDeviceStatus>;

  /** Update device firmware */
  updateFirmware(update: IFirmwareUpdate): Promise<ICommandResult>;
}

/**
 * Communication protocol interface
 */
export interface IProtocol {
  /** Protocol version */
  readonly version: ProtocolVersion;

  /** Supported message types */
  readonly supportedMessageTypes: MessageType[];

  /** Encode a message for transmission */
  encodeMessage(message: IGatewayMessage): Buffer;

  /** Decode a received message */
  decodeMessage(data: Buffer): IGatewayMessage;

  /** Validate message format */
  validateMessage(message: IGatewayMessage): boolean;

  /** Get protocol-specific capabilities */
  getCapabilities(): Record<string, any>;
}

/**
 * Connection interface for gateway communication
 */
export interface IGatewayConnection extends EventEmitter {
  /** Connection state */
  readonly state: GatewayConnectionState;

  /** Associated gateway ID */
  readonly gatewayId: string;

  /** Connect to the gateway */
  connect(): Promise<void>;

  /** Disconnect from the gateway */
  disconnect(): Promise<void>;

  /** Send data to the gateway */
  send(data: Buffer): Promise<void>;

  /** Check if connection is active */
  isConnected(): boolean;

  /** Get connection statistics */
  getStats(): {
    bytesSent: number;
    bytesReceived: number;
    messagesSent: number;
    messagesReceived: number;
    connectedAt: Date | undefined;
    lastActivity: Date | undefined;
  };
}

/**
 * Device manager interface
 */
export interface IDeviceManager {
  /** Register a device */
  registerDevice(device: IDevice): Promise<void>;

  /** Unregister a device */
  unregisterDevice(deviceId: string): Promise<void>;

  /** Get device by ID */
  getDevice(deviceId: string): IDevice | undefined;

  /** Get all devices for a gateway */
  getDevicesByGateway(gatewayId: string): IDevice[];

  /** Get device status */
  getDeviceStatus(deviceId: string): Promise<IDeviceStatus>;

  /** Execute command on device */
  executeDeviceCommand(deviceId: string, command: string, params?: any): Promise<ICommandResult>;
}

/**
 * Key manager interface
 */
export interface IKeyManager {
  /** Add access key to device */
  addKey(deviceId: string, key: IAccessKey): Promise<ICommandResult>;

  /** Remove access key from device */
  removeKey(deviceId: string, keyId: string): Promise<ICommandResult>;

  /** List keys for device */
  listKeys(deviceId: string): Promise<IAccessKey[]>;

  /** Grant access using key */
  grantAccess(deviceId: string, keyId: string): Promise<ICommandResult>;

  /** Revoke access */
  revokeAccess(deviceId: string, keyId: string): Promise<ICommandResult>;
}

/**
 * Firmware manager interface
 */
export interface IFirmwareManager {
  /** Schedule firmware update */
  scheduleUpdate(deviceId: string, update: IFirmwareUpdate): Promise<void>;

  /** Get update status */
  getUpdateStatus(deviceId: string): Promise<{
    updateId: string;
    status: 'pending' | 'downloading' | 'installing' | 'completed' | 'failed';
    progress: number;
    error?: string;
  }>;

  /** Cancel firmware update */
  cancelUpdate(deviceId: string): Promise<void>;
}

/**
 * Gateway registry interface
 */
export interface IGatewayRegistry {
  /** Register a gateway */
  registerGateway(gateway: IGateway): Promise<void>;

  /** Unregister a gateway */
  unregisterGateway(gatewayId: string): Promise<void>;

  /** Get gateway by ID */
  getGateway(gatewayId: string): IGateway | undefined;

  /** Get all gateways for a facility */
  getGatewaysByFacility(facilityId: string): IGateway[];

  /** Get gateway status */
  getGatewayStatus(gatewayId: string): Promise<IGatewayStatus>;
}

/**
 * Message handler interface
 */
export interface IMessageHandler {
  /** Handle incoming message */
  handleMessage(message: IGatewayMessage): Promise<void>;

  /** Send message to gateway */
  sendMessage(gatewayId: string, message: IGatewayMessage): Promise<void>;

  /** Register message handler for specific type */
  registerHandler(messageType: MessageType, handler: (message: IGatewayMessage) => Promise<void>): void;

  /** Unregister message handler */
  unregisterHandler(messageType: MessageType): void;
}

/**
 * Command queue interface for offline gateways
 */
export interface ICommandQueue {
  /** Queue a command for execution */
  queueCommand(gatewayId: string, command: IGatewayMessage): Promise<void>;

  /** Get queued commands for gateway */
  getQueuedCommands(gatewayId: string): IGatewayMessage[];

  /** Process queued commands when gateway comes online */
  processQueuedCommands(gatewayId: string): Promise<void>;

  /** Clear old/expired commands */
  cleanupExpiredCommands(): Promise<void>;
}

/**
 * Status monitor interface
 */
export interface IStatusMonitor {
  /** Start monitoring */
  start(): Promise<void>;

  /** Stop monitoring */
  stop(): Promise<void>;

  /** Check gateway health */
  checkGatewayHealth(gatewayId: string): Promise<{
    healthy: boolean;
    issues: string[];
    lastChecked: Date;
  }>;

  /** Check device health */
  checkDeviceHealth(deviceId: string): Promise<{
    healthy: boolean;
    issues: string[];
    lastChecked: Date;
  }>;

  /** Get system health overview */
  getSystemHealth(): Promise<{
    totalGateways: number;
    onlineGateways: number;
    totalDevices: number;
    onlineDevices: number;
    issues: Array<{
      type: 'gateway' | 'device';
      id: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
    }>;
  }>;
}
