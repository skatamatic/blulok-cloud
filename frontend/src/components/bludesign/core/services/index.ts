/**
 * BluDesign services — curated exports.
 *
 * Facility save/load shape lives in `../serialization` (pure functions). The engine
 * delegates to that module for a single source of truth.
 *
 * `ObjectManagementService` handles smart-object simulation/skin updates and is
 * covered by unit tests; the main editor coordinates lifecycle through BluDesignEngine.
 */

export {
  serializePlacedObjectForFacility,
  serializeBuildingForFacility,
  buildActiveSkinsRecordFromPlacedObjects,
  validateFacilityImportData,
  parseFacilityDataJson,
  estimateFacilityDataSizeBytes,
} from '../serialization';

export { ObjectManagementService, type ManagementContext } from './ObjectManagementService';
