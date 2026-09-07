import type { AssetMetadata, AssetCategory } from './types';
import type { AssetDefinition } from '../services/AssetService';

/**
 * Map a backend {@link AssetDefinition} to editor {@link AssetMetadata} for registry use.
 */
export function assetDefinitionToMetadata(def: AssetDefinition): AssetMetadata {
  return {
    id: def.id,
    name: def.name,
    category: def.category as AssetCategory,
    description: def.description,
    dimensions: def.dimensions,
    gridUnits: def.gridUnits,
    isSmart: def.isSmart,
    canRotate: def.canRotate,
    canStack: def.canStack,
    thumbnail: def.thumbnail,
    metadata: {
      modelType: def.modelType,
      globalModelId: def.globalModelId,
      positionOffset: def.positionOffset,
      lockerSpec: def.lockerSpec,
    },
  };
}
