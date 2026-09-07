/**
 * Facility save-format serialization — single source of truth for FacilityData v2.
 * Pure functions only; no Three.js scene side effects.
 */

import type {
  Building,
  FacilityData,
  PlacedObject,
  SerializedBuilding,
  SerializedPlacedObject,
} from '../types';

/**
 * Serialize one placed object for facility storage (minimal fields; metadata from registry on load).
 */
export function serializePlacedObjectForFacility(obj: PlacedObject): SerializedPlacedObject {
  const serialized: SerializedPlacedObject = {
    id: obj.id,
    assetId: obj.assetId,
    position: {
      x: Math.round(obj.position.x),
      z: Math.round(obj.position.z),
    },
    orientation: obj.orientation,
  };

  if (obj.floor && obj.floor !== 0) {
    serialized.floor = obj.floor;
  }
  if (obj.buildingId) {
    serialized.buildingId = obj.buildingId;
  }
  if (obj.name) {
    serialized.name = obj.name;
  }
  if (obj.wallAttachment) {
    serialized.wallAttachment = obj.wallAttachment;
  }
  if (obj.binding?.entityId) {
    serialized.binding = {
      entityType: obj.binding.entityType,
      entityId: obj.binding.entityId,
    };
  }
  if (obj.properties && Object.keys(obj.properties).length > 0) {
    serialized.properties = obj.properties;
  }
  if (obj.skinId) {
    serialized.skinId = obj.skinId;
  }
  if (obj.rotation !== undefined) {
    serialized.rotation = obj.rotation;
  }
  if (obj.exactMeshPos) {
    serialized.exactMeshPos = obj.exactMeshPos;
  }

  return serialized;
}

/**
 * Serialize one building for facility storage (strip runtime wall mesh ids, etc.).
 */
export function serializeBuildingForFacility(b: Building): SerializedBuilding {
  return {
    id: b.id,
    name: b.name,
    footprints: b.footprints.map((fp) => ({
      minX: fp.minX,
      maxX: fp.maxX,
      minZ: fp.minZ,
      maxZ: fp.maxZ,
    })),
    floors: b.floors.map((f) => ({ level: f.level, height: f.height })),
  };
}

/**
 * Map assetId → skinId for objects that have a per-object skin override (used in FacilityData.activeSkins).
 */
export function buildActiveSkinsRecordFromPlacedObjects(
  placedObjects: PlacedObject[]
): Record<string, string> {
  const activeSkins: Record<string, string> = {};
  for (const obj of placedObjects) {
    if (obj.skinId) {
      activeSkins[obj.assetId] = obj.skinId;
    }
  }
  return activeSkins;
}

/**
 * Structural validation for imported facility JSON (before engine applies it).
 */
export function validateFacilityImportData(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid data format: expected an object');
    return { valid: false, errors };
  }

  const facilityData = data as Partial<FacilityData>;

  if (facilityData.buildings && !Array.isArray(facilityData.buildings)) {
    errors.push('Invalid buildings format: expected an array');
  }

  if (facilityData.placedObjects && !Array.isArray(facilityData.placedObjects)) {
    errors.push('Invalid placedObjects format: expected an array');
  }

  if (Array.isArray(facilityData.buildings)) {
    facilityData.buildings.forEach((building, index) => {
      if (!building.id) {
        errors.push(`Building ${index}: missing id`);
      }
      if (!building.footprints || !Array.isArray(building.footprints)) {
        errors.push(`Building ${index}: invalid footprints`);
      }
    });
  }

  if (Array.isArray(facilityData.placedObjects)) {
    facilityData.placedObjects.forEach((obj, index) => {
      if (!obj.id) {
        errors.push(`Object ${index}: missing id`);
      }
      if (!obj.assetId) {
        errors.push(`Object ${index}: missing assetId`);
      }
      if (!obj.position || typeof obj.position.x !== 'number' || typeof obj.position.z !== 'number') {
        errors.push(`Object ${index}: invalid position`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse and validate facility JSON (e.g. drafts, clipboard). Returns null if invalid.
 */
export function parseFacilityDataJson(json: string): FacilityData | null {
  try {
    const data = JSON.parse(json) as unknown;
    const validation = validateFacilityImportData(data);
    if (!validation.valid) {
      console.warn('[facilitySerialization] Invalid facility data:', validation.errors);
      return null;
    }
    return data as FacilityData;
  } catch (error) {
    console.error('[facilitySerialization] Failed to parse facility JSON:', error);
    return null;
  }
}

export function estimateFacilityDataSizeBytes(data: FacilityData): number {
  return JSON.stringify(data).length;
}
