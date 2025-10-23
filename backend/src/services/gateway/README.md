# Gateway and Device Management System

This module provides a comprehensive, extensible system for managing gateways and devices in the Blulok facility management system.

## Architecture Overview

The system is built with a clean, layered architecture that supports multiple gateway types, communication protocols, and device types.

### Core Components

#### 1. Interfaces & Types (`gateway.types.ts`)
Defines all core interfaces and types used throughout the system:
- `IGateway` - Main gateway interface
- `IDevice` - Device interface
- `IProtocol` - Communication protocol interface
- `IGatewayConnection` - Connection management interface
- `IDeviceManager`, `IKeyManager`, `IFirmwareManager` - Service interfaces

#### 2. Protocol System
Handles communication protocol versioning and compatibility:
- **BaseProtocol** - Abstract base for all protocols
- **ProtocolV1** - Version 1.0 protocol implementation
- **SimulatedProtocol** - Testing protocol with realistic delays
- **ProtocolFactory** - Factory for creating protocol instances

#### 3. Connection System
Manages different types of connections:
- **BaseConnection** - Abstract connection base class
- **WebSocketConnection** - WebSocket-based connections
- **HttpConnection** - HTTP-based connections for existing APIs
- **SimulatedConnection** - Simulated connections for testing

#### 4. Gateway Hierarchy
Supports multiple gateway implementations:
- **BaseGateway** - Abstract gateway base class
- **PhysicalGateway** - WebSocket-based physical gateways
- **HttpGateway** - HTTP API-based gateways (current implementation)
- **SimulatedGateway** - Simulated gateways for testing
- **GatewayFactory** - Factory for creating gateway instances

#### 5. Service Layer
High-level services for managing gateways:
- **GatewayService** - Main service for gateway management
- **DeviceManager** - Device lifecycle management
- **KeyManager** - Access key management
- **FirmwareManager** - Firmware update management

## Current Implementation

### HTTP Gateway (Mesh Manager API)

The current implementation uses HTTP calls to the existing Mesh Manager API:

#### Supported Operations
- **Authentication**: Sign in, refresh tokens, sessions
- **Key Management**: Add keys, revoke keys, get keys, get lock state
- **Lock Control**: Send OPEN/CLOSE commands to locks
- **Device Management**: Get all locks, device registration
- **Push Notifications**: FCM messaging support

#### Configuration
```typescript
const gateway = GatewayFactory.createHttpGateway(
  'gateway-id',
  'facility-id',
  'https://192.168.3.182:8443/api', // Base URL
  'your-api-key',                   // API Key
  'admin',                         // Username
  'admin'                          // Password
);
```

#### Usage Example
```typescript
import { GatewayService } from './gateway.service';

const gatewayService = GatewayService.getInstance();

// Initialize all configured gateways
await gatewayService.initializeAllGateways();

// Connect to a specific gateway
await gatewayService.connectGateway('gateway-id');

// Send lock command
const result = await gatewayService.sendLockCommand('gateway-id', 'lock-123', 'OPEN');

// Add access key
const keyResult = await gatewayService.addKey('gateway-id', 'lock-123', {
  revision: 0,
  key_code: 12345,
  key_counter: 1000,
  key_secret: 'secret123',
  key_token: 'token123'
});
```

## API Endpoints

The Mesh Manager API includes these endpoints:

### Authentication
- `POST /auth/sign-in` - Login with username/password
- `POST /auth/refresh` - Refresh access token
- `GET /auth/sessions` - Get active sessions
- `DELETE /auth/sessions/{id}` - Logout session

### Keys
- `POST /keys/add-key` - Add access key to lock
- `DELETE /keys/revoke-key` - Revoke access key
- `GET /keys/get-keys` - Get keys for lock
- `GET /keys/get-lock-state` - Get lock status

### Locks
- `POST /locks/send-lock-command` - Send OPEN/CLOSE command
- `GET /locks/all` - Get all locks

### Devices
- `POST /devices/register` - Register mobile device
- `GET /devices/get-ip` - Get gateway IP address

### FCM (Push Notifications)
- `POST https://fcm.googleapis.com/v1/projects/blulok/messages:send` - Send push notifications

## Future Extensions

### WebSocket Implementation
Replace HTTP polling with persistent WebSocket connections for real-time communication.

### Additional Device Types
- **Cameras**: Video streaming and recording
- **Sensors**: Environmental monitoring (temperature, humidity)
- **Intercoms**: Audio communication systems

### Advanced Features
- **Firmware Updates**: Over-the-air updates with rollback support
- **Device Discovery**: Automatic device detection and registration
- **Load Balancing**: Distribute commands across multiple gateways
- **Offline Queuing**: Queue commands when gateways are offline

### Protocol Evolution
- **Protocol V2.0**: Enhanced security and performance
- **Binary Protocols**: More efficient data transmission
- **Message Compression**: Reduce bandwidth usage

## Testing Strategy

The system includes comprehensive testing at multiple levels:

### Unit Tests
- Protocol implementations
- Connection classes
- Gateway classes
- Service classes

### Integration Tests
- End-to-end gateway communication
- Multi-gateway scenarios
- Failure recovery scenarios

### Simulation Testing
- SimulatedGateway and SimulatedConnection for reliable testing
- Realistic network delays and failures
- Deterministic test scenarios

## Configuration

Gateways are configured through the database with these fields:
- `gateway_type`: 'physical' | 'http' | 'simulated'
- `base_url`: HTTP API base URL
- `api_key`: API key for authentication
- `connection_url`: WebSocket URL (for future use)
- `protocol_version`: Protocol version to use

## Error Handling

The system includes robust error handling:
- **Connection Failures**: Automatic reconnection with exponential backoff
- **Authentication Errors**: Token refresh and re-authentication
- **Device Errors**: Graceful degradation and error reporting
- **Network Issues**: Queuing and retry mechanisms

## Security Considerations

- **Encrypted Communications**: All data transmission is secured
- **Access Control**: Role-based permissions for gateway operations
- **Audit Logging**: All operations are logged for compliance
- **Key Management**: Secure storage and transmission of access keys

## Monitoring and Health Checks

The system provides comprehensive monitoring:
- **Gateway Health**: Connection status, uptime, resource usage
- **Device Health**: Online/offline status, error conditions
- **Performance Metrics**: Response times, throughput, error rates
- **Alert System**: Automatic alerts for critical issues

