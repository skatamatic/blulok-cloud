import { AssetRegistry } from '../../assets/AssetRegistry';
import { AssetService } from '../../services/AssetService';
import { assetDefinitionToMetadata } from '../assetDefinitionToMetadata';

/**
 * Fetch and register custom asset definitions missing from the registry (import preload).
 */
export async function preloadFacilityCustomAssets(assetIds: string[]): Promise<void> {
  const registry = AssetRegistry.getInstance();
  const missingIds = assetIds.filter((id) => !registry.getAsset(id));

  if (missingIds.length === 0) return;

  console.log(`[FacilityImport] Pre-loading ${missingIds.length} custom assets...`);

  const fetchPromises = missingIds.map(async (id) => {
    try {
      const definition = await AssetService.getAssetDefinition(id);
      if (definition) {
        const metadata = assetDefinitionToMetadata(definition);
        registry.registerAsset(metadata);
        console.log(`[FacilityImport] ✓ Loaded custom asset: ${definition.name}`);
      }
    } catch (error) {
      console.warn(`[FacilityImport] Failed to load custom asset ${id}:`, error);
    }
  });

  await Promise.allSettled(fetchPromises);
}
