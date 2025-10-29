/**
 * Gateway and Device Management Types
 *
 * Comprehensive type definitions for the BluLok gateway and device management system.
 * This module defines the core abstractions for managing network gateways, device communication,
 * access control, and system integration.
 *
 * Key Concepts:
 * - Gateways: Network bridges between cloud and physical facilities
 * - Devices: Physical hardware (locks, sensors, cameras) managed by gateways
 * - Connections: Communication channels (WebSocket, HTTP, simulated)
 * - Protocols: Message framing and version compatibility
 * - Commands: Device control and status operations
 */

import { EventEmitter } from 'events';

/**
 * Gateway Connection State Enumeration
 *
 * Defines the possible states of a gateway's network connection to the cloud.
 * Used for monitoring, health checks, and automatic recovery mechanisms.
 */
export enum GatewayConnectionState {
  /** Gateway is not connected to the cloud */
  DISCONNECTED = 'disconnected',
  /** Gateway is establishing a connection */
  CONNECTING = 'connecting',
  /** Gateway is connected and operational */
  CONNECTED = 'connected',
  /** Gateway is attempting to reconnect after disconnection */
  RECONNECTING = 'reconnecting',
  /** Gateway connection failed with an error condition */
  ERROR = 'error',
}

/**
 * Device Connection State Enumeration
 *
 * Defines the possible connectivity states of individual devices managed by gateways.
 * Critical for monitoring device health and triggering maintenance workflows.
 */
export enum DeviceConnectionState {
  /** Device state is unknown (initial state or communication failure) */
  UNKNOWN = 'unknown',
  /** Device is online and responding to commands */
  ONLINE = 'online',
  /** Device is offline or unreachable */
  OFFLINE = 'offline',
  /** Device is in an error state requiring attention */
  ERROR = 'error',
  /** Device is under maintenance and temporarily unavailable */
  MAINTENANCE = 'maintenance',
}

/**
 * Device Type Enumeration
 *
 * Defines the supported device types in the BluLok system.
 * Each device type has specific capabilities and management requirements.
 */
export enum DeviceType {
  /** Smart lock device for physical access control */
  LOCK = 'lock',
  /** Access control panel or reader device */
  ACCESS_CONTROL = 'access_control',
  /** Environmental or security sensor device */
  SENSOR = 'sensor',
  /** Security camera device */
  CAMERA = 'camera',
  /** Audio/video intercom device */
  INTERCOM = 'intercom',
}

/**
 * Access Key Type Enumeration
 *
 * Defines the different types of access keys supported by the system.
 * Key types determine access duration, validation rules, and revocation policies.
 */
export enum KeyType {
  /** Physical key or credential (traditional access) */
  PHYSICAL = 'physical',
  /** Digital/mobile key with cryptographic verification */
  DIGITAL = 'digital',
  /** Temporary access key with expiration */
  TEMPORARY = 'temporary',
  /** Master key with elevated privileges */
  MASTER = 'master',
}

/**
 * Protocol Version Enumeration
 *
 * Defines supported protocol versions for gateway communication.
 * Protocol versions ensure backward compatibility and feature evolution.
 */
export enum ProtocolVersion {
  /** Legacy protocol version 1.0 with basic functionality */
  V1_0 = '1.0',
  /** Enhanced protocol version 1.1 with additional features */
  V1_1 = '1.1',
  /** Major protocol version 2.0 with breaking changes */
  V2_0 = '2.0',
  /** Simulated protocol for testing and development */
  SIMULATED = 'simulated',
}

/**
 * Message Type Enumeration
 *
 * Defines all message types used in gateway-device communication.
 * Message types categorize communication for routing and processing.
 */
export enum MessageType {
  // Device Management Messages
  /** Request current status from a device */
  DEVICE_STATUS_REQUEST = 'device_status_request',
  /** Response containing device status information */
  DEVICE_STATUS_RESPONSE = 'device_status_response',
  /** Command to execute on a device */
  DEVICE_COMMAND = 'device_command',
  /** Response to a device command execution */
  DEVICE_COMMAND_RESPONSE = 'device_command_response',

  // Access Control Messages
  /** Add a new access key to device */
  KEY_ADD = 'key_add',
  /** Remove an access key from device */
  KEY_REMOVE = 'key_remove',
  /** Request list of keys on device */
  KEY_LIST = 'key_list',
  /** Grant access to a user/device */
  ACCESS_GRANT = 'access_grant',
  /** Deny access to a user/device */
  ACCESS_DENY = 'access_deny',

  // Firmware Management Messages
  /** Request firmware update for device */
  FIRMWARE_UPDATE_REQUEST = 'firmware_update_request',
  /** Report firmware update status */
  FIRMWARE_UPDATE_STATUS = 'firmware_update_status',
  /** Send firmware update data chunk */
  FIRMWARE_UPDATE_CHUNK = 'firmware_update_chunk',

  // System Management Messages
  /** Periodic heartbeat for connection health */
  HEARTBEAT = 'heartbeat',
  /** Network ping for connectivity testing */
  PING = 'ping',
  /** Response to ping message */
  PONG = 'pong',
  /** Error notification and details */
  ERROR = 'error',
}

/**
 * Command Priority Enumeration
 *
 * Defines priority levels for command execution.
 * Higher priority commands are processed before lower priority ones.
 */
export enum CommandPriority {
  /** Low priority background operations */
  LOW = 'low',
  /** Normal priority regular operations */
  NORMAL = 'normal',
  /** High priority important operations */
  HIGH = 'high',
  /** Critical priority emergency operations */
  CRITICAL = 'critical',
}

/**
 * Gateway Capabilities Interface
 *
 * Defines the capabilities and features supported by a gateway implementation.
 * Used for gateway compatibility checking and feature negotiation.
 */
export interface IGatewayCapabilities {
  /** Array of protocol versions supported by this gateway */
  supportedProtocols: ProtocolVersion[];

  /** Maximum number of concurrent connections this gateway can handle */
  maxConnections: number;

  /** Array of device types that this gateway can manage */
  supportedDeviceTypes: DeviceType[];

  /** Whether this gateway supports remote firmware updates */
  firmwareUpdateSupport: boolean;

  /** Whether this gateway supports remote access control operations */
  remoteAccessSupport: boolean;

  /** Whether this gateway supports cryptographic key management */
  keyManagementSupport: boolean;

  /** Heartbeat interval in milliseconds for connection health monitoring */
  heartbeatInterval?: number;
}

/**
 * Device Information Interface
 *
 * Comprehensive information about a physical device managed by a gateway.
 * Contains hardware details, firmware status, and operational metadata.
 */
export interface IDeviceInfo {
  /** Globally unique identifier for the device */
  id: string;

  /** Type classification of the device (lock, sensor, etc.) */
  type: DeviceType;

  /** Manufacturer model or version string */
  model: string;

  /** Manufacturer-assigned serial number for warranty and support */
  serialNumber: string;

  /** Current firmware version installed on the device */
  firmwareVersion: string;

  /** Hardware revision level for compatibility checking */
  hardwareRevision: string;

  /** Date and time when the device was installed at the facility */
  installedAt: Date;

  /** Last timestamp when the device was successfully contacted */
  lastSeen?: Date;

  /** Device-specific configuration parameters and settings */
  configuration: Record<string, any>;
}

/**
 * Access Key Information Interface
 *
 * Represents an access key for device authentication and authorization.
 * Keys can be physical, digital, temporary, or master types with different permissions.
 */
export interface IAccessKey {
  /** Globally unique identifier for the access key */
  id: string;

  /** Type of key determining access rules and validation */
  type: KeyType;

  /** User ID that owns or is associated with this key */
  userId: string;

  /** Encrypted key material or credential data */
  keyData: string;

  /** Timestamp when the key becomes valid */
  validFrom: Date;

  /** Optional expiration timestamp for temporary keys */
  validUntil?: Date;

  /** Array of permissions granted by this key */
  permissions: string[];

  /** Whether the key is currently active and usable */
  isActive: boolean;

  /** Timestamp when the key was created */
  createdAt: Date;

  /** Last timestamp when the key was successfully used */
  lastUsedAt?: Date;
}

/**
 * Firmware Update Information Interface
 *
 * Defines metadata for firmware update packages that can be deployed to devices.
 * Contains version information, compatibility requirements, and update details.
 */
export interface IFirmwareUpdate {
  /** Unique identifier for the firmware update package */
  id: string;

  /** Target firmware version string (semantic versioning) */
  version: string;

  /** SHA-256 checksum of the firmware file for integrity verification */
  checksum: string;

  /** Size of the firmware file in bytes */
  size: number;

  /** Priority level determining update scheduling and interruption rules */
  priority: 'low' | 'normal' | 'high' | 'critical';

  /** Human-readable description of the firmware update */
  description: string;

  /** Detailed release notes describing changes and fixes */
  releaseNotes?: string;

  /** Array of device model strings that are compatible with this firmware */
  compatibleModels: string[];

  /** Minimum firmware version required before applying this update */
  minimumVersion?: string;
}

/**
 * Gateway Status Information Interface
 *
 * Real-time operational status of a gateway including connection state,
 * system resources, and operational metrics.
 */
export interface IGatewayStatus {
  /** Unique identifier of the gateway */
  id: string;

  /** Current network connection state of the gateway */
  connectionState: GatewayConnectionState;

  /** Timestamp of the last successful heartbeat from the gateway */
  lastHeartbeat?: Date;

  /** Gateway uptime in seconds since last restart */
  uptime?: number;

  /** Current memory usage as a percentage (0-100) */
  memoryUsage?: number;

  /** Current CPU usage as a percentage (0-100) */
  cpuUsage?: number;

  /** Number of devices currently connected to this gateway */
  deviceCount: number;

  /** Gateway software version string */
  version: string;

  /** Protocol version currently in use by the gateway */
  protocolVersion: ProtocolVersion;

  /** Error message if the gateway is in an error state */
  errorMessage?: string;
}

/**
 * Device Status Information Interface
 *
 * Current operational status and sensor readings from a physical device.
 * Includes connection state, device-specific metrics, and health indicators.
 */
export interface IDeviceStatus {
  /** Unique identifier of the device */
  id: string;

  /** Current network connection state of the device */
  connectionState: DeviceConnectionState;

  /** Lock state for lock devices (true = locked, false = unlocked) */
  isLocked?: boolean;

  /** Battery charge level as a percentage (0-100) */
  batteryLevel?: number;

  /** Wireless signal strength as a percentage (0-100) */
  signalStrength?: number;

  /** Device temperature in Celsius (if sensor-equipped) */
  temperature?: number;

  /** Timestamp of the last device activity or command execution */
  lastActivity?: Date;

  /** Whether the device is currently in an error condition */
  hasError: boolean;

  /** Error message describing any current device issues */
  errorMessage?: string;
}

/**
 * Gateway Message Envelope Interface
 *
 * Standard message format for all gateway communication.
 * Provides metadata for routing, prioritization, and correlation.
 */
export interface IGatewayMessage {
  /** Globally unique identifier for message tracking and deduplication */
  id: string;

  /** Type of message determining processing logic and routing */
  type: MessageType;

  /** Identifier of the message sender (gateway ID or 'cloud') */
  source: string;

  /** Identifier of the intended message recipient */
  destination: string;

  /** Protocol version used for message encoding/decoding */
  protocolVersion: ProtocolVersion;

  /** Timestamp when the message was created */
  timestamp: Date;

  /** Message-specific payload data (type depends on MessageType) */
  payload: any;

  /** Priority level for message queuing and processing */
  priority: CommandPriority;

  /** Expected timeout in seconds for response messages */
  timeout?: number;

  /** Unique identifier linking request and response messages */
  correlationId?: string;
}

/**
 * Command Execution Result Interface
 *
 * Standardized result format for command execution on devices or gateways.
 * Provides success/failure status and execution metadata.
 */
export interface ICommandResult {
  /** Whether the command executed successfully */
  success: boolean;

  /** Command-specific result data (varies by command type) */
  data?: any;

  /** Error message if command execution failed */
  error?: string;

  /** Timestamp when command execution completed */
  executedAt: Date;

  /** Total execution time in milliseconds */
  duration: number;
}

/**
 * Core Gateway Interface
 *
 * Primary abstraction for gateway communication and device management.
 * Provides unified interface for different gateway implementations (physical, HTTP, simulated).
 *
 * Key Responsibilities:
 * - Device lifecycle management (registration, status monitoring)
 * - Command execution and response handling
 * - Message routing and protocol abstraction
 * - Connection management and health monitoring
 * - Key management for access control
 */
export interface IGateway extends EventEmitter {
  /** Globally unique identifier for the gateway instance */
  readonly id: string;

  /** Static capabilities defining supported features and limits */
  readonly capabilities: IGatewayCapabilities;

  /** Real-time operational status and health metrics */
  readonly status: IGatewayStatus;

  /** Facility identifier that this gateway serves */
  readonly facilityId: string;

  /** Protocol version for message encoding and compatibility */
  readonly protocolVersion: ProtocolVersion;

  /** Key management format version (v1=legacy Postman, v2=ED25519) */
  readonly keyManagementVersion: 'v1' | 'v2';

  /** Initialize gateway resources and prepare for operation */
  initialize(): Promise<void>;

  /** Gracefully shutdown gateway and cleanup resources */
  shutdown(): Promise<void>;

  /** Establish connection to the physical or virtual gateway */
  connect(silent?: boolean): Promise<void>;

  /** Disconnect from the gateway with optional silent operation */
  disconnect(silent?: boolean): Promise<void>;

  /** Send a structured message to the gateway for processing */
  sendMessage(message: IGatewayMessage): Promise<void>;

  /** Register a new device with the gateway for management */
  registerDevice(deviceInfo: IDeviceInfo): Promise<void>;

  /** Remove a device from gateway management */
  unregisterDevice(deviceId: string): Promise<void>;

  /** Retrieve current operational status of a specific device */
  getDeviceStatus(deviceId: string): Promise<IDeviceStatus>;

  /** Execute an arbitrary command on a device with parameters */
  executeDeviceCommand(deviceId: string, command: string, params?: any): Promise<ICommandResult>;

  /** Synchronize device registry and status with gateway */
  sync(updateStatus?: boolean): Promise<{
    devices: any[];
    syncResults: {
      devicesFound: number;
      devicesSynced: number;
      keysRetrieved: number;
      errors: string[];
    };
  }>;

  /** Add cryptographic access key to device (key management v1/v2) */
  addKey?(deviceId: string, keyData: any): Promise<ICommandResult>;

  /** Remove cryptographic access key from device (key management v1/v2) */
  revokeKey?(deviceId: string, keyCode: number, publicKey?: string): Promise<ICommandResult>;

  /** Retrieve all access keys programmed on a device */
  getKeys?(deviceId: string): Promise<any[]>;

  /** Retrieve complete list of locks/devices managed by gateway */
  getAllLocks?(): Promise<any[]>;

  /** Send Firebase Cloud Messaging notification to mobile device */
  sendFCMMessage?(token: string, data: any): Promise<ICommandResult>;
}

/**
 * Core Device Interface
 *
 * Abstraction for individual physical devices managed through gateways.
 * Provides unified interface for device operations and status monitoring.
 */
export interface IDevice {
  /** Static device information and metadata */
  readonly info: IDeviceInfo;

  /** Real-time device operational status */
  readonly status: IDeviceStatus;

  /** Gateway identifier managing this device */
  readonly gatewayId: string;

  /** Execute command on this device with optional parameters */
  executeCommand(command: string, params?: any): Promise<ICommandResult>;

  /** Retrieve current device operational status */
  getStatus(): Promise<IDeviceStatus>;

  /** Perform firmware update on this device */
  updateFirmware(update: IFirmwareUpdate): Promise<ICommandResult>;
}

/**
 * Communication Protocol Interface
 *
 * Defines the contract for gateway communication protocols.
 * Handles message encoding/decoding and protocol-specific capabilities.
 */
export interface IProtocol {
  /** Protocol version identifier for compatibility checking */
  readonly version: ProtocolVersion;

  /** Array of message types supported by this protocol version */
  readonly supportedMessageTypes: MessageType[];

  /** Encode structured message into binary format for transmission */
  encodeMessage(message: IGatewayMessage): Buffer;

  /** Decode binary data into structured message format */
  decodeMessage(data: Buffer): IGatewayMessage;

  /** Validate message structure and content against protocol rules */
  validateMessage(message: IGatewayMessage): boolean;

  /** Return protocol-specific capabilities and configuration */
  getCapabilities(): Record<string, any>;
}

/**
 * Gateway Connection Interface
 *
 * Defines the contract for network connections to gateways.
 * Handles connection lifecycle, data transmission, and statistics.
 */
export interface IGatewayConnection extends EventEmitter {
  /** Current connection state in the state machine */
  readonly state: GatewayConnectionState;

  /** Unique identifier of the gateway this connection serves */
  readonly gatewayId: string;

  /** Establish network connection to the gateway */
  connect(): Promise<void>;

  /** Gracefully close the network connection */
  disconnect(): Promise<void>;

  /** Transmit binary data to the connected gateway */
  send(data: Buffer): Promise<void>;

  /** Check if the connection is currently active and usable */
  isConnected(): boolean;

  /** Retrieve connection statistics and performance metrics */
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
 * Device Manager Interface
 *
 * Central registry and management interface for all devices in the system.
 * Provides device lifecycle management and operation orchestration.
 */
export interface IDeviceManager {
  /** Register a new device instance with the manager */
  registerDevice(device: IDevice): Promise<void>;

  /** Remove a device from management and cleanup resources */
  unregisterDevice(deviceId: string): Promise<void>;

  /** Retrieve device instance by unique identifier */
  getDevice(deviceId: string): IDevice | undefined;

  /** Get all devices associated with a specific gateway */
  getDevicesByGateway(gatewayId: string): IDevice[];

  /** Retrieve current operational status of a device */
  getDeviceStatus(deviceId: string): Promise<IDeviceStatus>;

  /** Execute command on device through the device manager */
  executeDeviceCommand(deviceId: string, command: string, params?: any): Promise<ICommandResult>;
}

/**
 * Key Manager Interface
 *
 * Manages cryptographic access keys for device authentication and authorization.
 * Handles key lifecycle from creation to revocation across all devices.
 */
export interface IKeyManager {
  /** Add a new access key to a device with key data and metadata */
  addKey(deviceId: string, key: IAccessKey): Promise<ICommandResult>;

  /** Remove an access key from a device by key identifier */
  removeKey(deviceId: string, keyId: string): Promise<ICommandResult>;

  /** Retrieve all access keys currently programmed on a device */
  listKeys(deviceId: string): Promise<IAccessKey[]>;

  /** Grant access to a device using a specific key identifier */
  grantAccess(deviceId: string, keyId: string): Promise<ICommandResult>;

  /** Revoke access from a device for a specific key identifier */
  revokeAccess(deviceId: string, keyId: string): Promise<ICommandResult>;
}

/**
 * Firmware Manager Interface
 *
 * Manages device firmware updates across the gateway network.
 * Handles update scheduling, progress tracking, and rollback capabilities.
 */
export interface IFirmwareManager {
  /** Schedule a firmware update for a specific device */
  scheduleUpdate(deviceId: string, update: IFirmwareUpdate): Promise<void>;

  /** Get the current status and progress of a firmware update */
  getUpdateStatus(deviceId: string): Promise<{
    updateId: string;
    status: 'pending' | 'downloading' | 'installing' | 'completed' | 'failed';
    progress: number;
    error?: string;
  }>;

  /** Cancel an in-progress or scheduled firmware update */
  cancelUpdate(deviceId: string): Promise<void>;
}

/**
 * Gateway Registry Interface
 *
 * Central registry for managing gateway instances across facilities.
 * Provides gateway discovery, registration, and status monitoring.
 */
export interface IGatewayRegistry {
  /** Register a new gateway instance with the registry */
  registerGateway(gateway: IGateway): Promise<void>;

  /** Remove a gateway from the registry and cleanup resources */
  unregisterGateway(gatewayId: string): Promise<void>;

  /** Retrieve gateway instance by unique identifier */
  getGateway(gatewayId: string): IGateway | undefined;

  /** Get all gateways associated with a specific facility */
  getGatewaysByFacility(facilityId: string): IGateway[];

  /** Retrieve current operational status of a gateway */
  getGatewayStatus(gatewayId: string): Promise<IGatewayStatus>;
}

/**
 * Message Handler Interface
 *
 * Handles routing and processing of messages between gateways and the cloud.
 * Provides message type-specific handling and response routing.
 */
export interface IMessageHandler {
  /** Process an incoming message from a gateway */
  handleMessage(message: IGatewayMessage): Promise<void>;

  /** Send a message to a specific gateway for processing */
  sendMessage(gatewayId: string, message: IGatewayMessage): Promise<void>;

  /** Register a handler function for a specific message type */
  registerHandler(messageType: MessageType, handler: (message: IGatewayMessage) => Promise<void>): void;

  /** Remove the handler for a specific message type */
  unregisterHandler(messageType: MessageType): void;
}

/**
 * Command Queue Interface
 *
 * Manages command queuing for offline or intermittently connected gateways.
 * Ensures commands are delivered when gateways come back online.
 */
export interface ICommandQueue {
  /** Queue a command for later execution when gateway is available */
  queueCommand(gatewayId: string, command: IGatewayMessage): Promise<void>;

  /** Retrieve all queued commands for a specific gateway */
  getQueuedCommands(gatewayId: string): IGatewayMessage[];

  /** Process and execute all queued commands for an online gateway */
  processQueuedCommands(gatewayId: string): Promise<void>;

  /** Remove expired or obsolete commands from the queue */
  cleanupExpiredCommands(): Promise<void>;
}

/**
 * Status Monitor Interface
 *
 * Monitors the health and operational status of gateways and devices.
 * Provides proactive alerting and automated recovery capabilities.
 */
export interface IStatusMonitor {
  /** Start the monitoring service and begin health checks */
  start(): Promise<void>;

  /** Stop the monitoring service and cleanup resources */
  stop(): Promise<void>;

  /** Perform comprehensive health check on a specific gateway */
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
