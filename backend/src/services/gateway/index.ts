/**
 * Gateway and Device Management Module
 *
 * This module provides a comprehensive system for managing gateways and devices
 * in the Blulok facility management system.
 */

// Core types and interfaces
export * from '../../types/gateway.types';

// Protocol system
export { BaseProtocol } from './protocols/base.protocol';
export { ProtocolV1 } from './protocols/protocol-v1';
export { SimulatedProtocol } from './protocols/simulated.protocol';
export { ProtocolFactory } from './protocols/protocol-factory';

// Connection system
export { BaseConnection } from './connections/base.connection';
export { WebSocketConnection } from './connections/websocket.connection';
export { SimulatedConnection } from './connections/simulated.connection';
export { HttpConnection } from './connections/http.connection';

// Gateway implementations
export { BaseGateway } from './gateways/base.gateway';
export { PhysicalGateway } from './gateways/physical.gateway';
export { SimulatedGateway } from './gateways/simulated.gateway';
export { HttpGateway } from './gateways/http.gateway';
export { GatewayFactory } from './gateways/gateway-factory';

// Services
export { GatewayService } from './gateway.service';

