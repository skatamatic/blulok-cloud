/**
 * Rebuilds a full {@link PlacedObject} from v2 {@link SerializedPlacedObject} + registry metadata.
 */

import type { AssetMetadata, PlacedObject, SerializedPlacedObject } from '../types';
import { DeviceState } from '../types';

/**
 * @param getAssetMetadata - typically {@link AssetRegistry#getAsset}
 * @returns `null` if the asset id is not registered
 */
export function reconstructPlacedObjectFromSerialized(
  serialized: SerializedPlacedObject,
  getAssetMetadata: (assetId: string) => AssetMetadata | undefined
): PlacedObject | null {
  const assetMetadata = getAssetMetadata(serialized.assetId);
  if (!assetMetadata) {
    return null;
  }

  return {
    id: serialized.id,
    assetId: serialized.assetId,
    assetMetadata,
    position: serialized.position,
    orientation: serialized.orientation,
    rotation: serialized.rotation,
    exactMeshPos: serialized.exactMeshPos,
    canStack: assetMetadata.canStack,
    floor: serialized.floor ?? 0,
    buildingId: serialized.buildingId,
    name: serialized.name,
    wallAttachment: serialized.wallAttachment,
    binding: serialized.binding
      ? {
          entityType: serialized.binding.entityType,
          entityId: serialized.binding.entityId,
          currentState: DeviceState.UNKNOWN,
        }
      : undefined,
    skinId: serialized.skinId,
    properties: serialized.properties || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
