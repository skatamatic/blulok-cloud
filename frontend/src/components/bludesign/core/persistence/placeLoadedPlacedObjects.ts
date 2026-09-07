import { AssetRegistry } from '../../assets/AssetRegistry';
import type { PlacedObjectPlacementCoordinator } from '../placement/PlacedObjectPlacementCoordinator';
import { reconstructPlacedObjectFromSerialized } from '../serialization/reconstructPlacedObjectFromSerialized';
import type { PlacedObject, SerializedPlacedObject } from '../types';

export function placePlacedObjectFromSerializedForImport(
  serialized: SerializedPlacedObject,
  placementCoordinator: PlacedObjectPlacementCoordinator
): void {
  try {
    const placedObject = reconstructPlacedObjectFromSerialized(serialized, (assetId) =>
      AssetRegistry.getInstance().getAsset(assetId)
    );
    if (!placedObject) {
      console.warn(`Asset not found in registry: ${serialized.assetId}`);
      return;
    }
    placePlacedObjectFromSavedForImport(placedObject, placementCoordinator);
  } catch (error) {
    console.error('Failed to place object from serialized data:', serialized.id, error);
  }
}

export function placePlacedObjectFromSavedForImport(
  obj: PlacedObject,
  placementCoordinator: PlacedObjectPlacementCoordinator
): void {
  try {
    placementCoordinator.placeFromSavedData(obj);
  } catch (error) {
    console.error(`Failed to place object ${obj.id}:`, error);
  }
}
