import { AssetRegistry } from '../../../../components/bludesign/assets/AssetRegistry';
import { AssetService } from '../../../../components/bludesign/services/AssetService';
import { preloadFacilityCustomAssets } from '../../../../components/bludesign/core/persistence/preloadFacilityCustomAssets';
import { AssetCategory } from '../../../../components/bludesign/core/types';

jest.mock('../../../../components/bludesign/services/AssetService', () => ({
  AssetService: {
    getAssetDefinition: jest.fn(),
  },
}));

const mockGetAssetDefinition = AssetService.getAssetDefinition as jest.MockedFunction<
  typeof AssetService.getAssetDefinition
>;

describe('preloadFacilityCustomAssets', () => {
  const ids = ['preload-known', 'preload-custom-1', 'preload-custom-2'];

  beforeEach(() => {
    jest.clearAllMocks();
    const registry = AssetRegistry.getInstance();
    for (const id of ids) registry.unregisterAsset(id);
  });

  it('skips fetch when all ids are already registered', async () => {
    const registry = AssetRegistry.getInstance();
    registry.registerAsset({
      id: 'preload-known',
      name: 'Known',
      category: AssetCategory.STORAGE_UNIT,
      dimensions: { width: 1, height: 1, depth: 1 },
      gridUnits: { x: 1, z: 1 },
      isSmart: false,
      canRotate: true,
      canStack: false,
    });

    await preloadFacilityCustomAssets(['preload-known']);

    expect(mockGetAssetDefinition).not.toHaveBeenCalled();
  });

  it('fetches and registers missing custom assets', async () => {
    mockGetAssetDefinition.mockResolvedValue({
      id: 'preload-custom-1',
      name: 'Custom Locker',
      category: AssetCategory.STORAGE_UNIT,
      description: 'test',
      dimensions: { width: 1, height: 2, depth: 1 },
      gridUnits: { x: 1, z: 1 },
      isSmart: true,
      canRotate: true,
      canStack: false,
      modelUrl: '/models/custom.glb',
      thumbnailUrl: '/thumb.png',
    });

    await preloadFacilityCustomAssets(['preload-custom-1']);

    expect(mockGetAssetDefinition).toHaveBeenCalledWith('preload-custom-1');
    expect(AssetRegistry.getInstance().getAsset('preload-custom-1')?.name).toBe('Custom Locker');
  });

  it('continues when individual asset fetch fails', async () => {
    mockGetAssetDefinition
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        id: 'preload-custom-2',
        name: 'Other',
        category: AssetCategory.GATE,
        description: '',
        dimensions: { width: 1, height: 1, depth: 1 },
        gridUnits: { x: 1, z: 1 },
        isSmart: false,
        canRotate: true,
        canStack: false,
      });

    await preloadFacilityCustomAssets(['bad', 'preload-custom-2']);

    expect(AssetRegistry.getInstance().getAsset('preload-custom-2')?.name).toBe('Other');
  });
});
