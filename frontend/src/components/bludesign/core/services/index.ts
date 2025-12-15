/**
 * BluDesign Core Services
 * 
 * Modular services extracted from BluDesignEngine following SOLID principles.
 * Each service handles a specific domain of functionality.
 */

export { ObjectPlacementService, type PlacementContext, type PlacementResult } from './ObjectPlacementService';
export { ObjectManagementService, type ManagementContext } from './ObjectManagementService';
export { FloorService, type FloorContext, type FloorOperationResult } from './FloorService';
export { HistoryService, type HistoryAction, type ActionType } from './HistoryService';
export { SerializationService, type SerializationContext } from './SerializationService';
export type { SerializedBuilding, SerializedPlacedObject } from '../types';

