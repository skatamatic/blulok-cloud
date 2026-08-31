/**
 * Facility serialization — pure helpers shared by BluDesignEngine and tooling.
 */
export {
  serializePlacedObjectForFacility,
  serializeBuildingForFacility,
  buildActiveSkinsRecordFromPlacedObjects,
  validateFacilityImportData,
  parseFacilityDataJson,
  estimateFacilityDataSizeBytes,
} from './facilitySerialization';
export {
  isLegacyFacilityFormat,
  collectUniqueSerializedAssetIds,
} from './facilityImportHelpers';
export { reconstructPlacedObjectFromSerialized } from './reconstructPlacedObjectFromSerialized';
