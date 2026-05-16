import { AssetCategory } from '../../../components/bludesign/core/types';
import type { AssetDefinition } from '../../../components/bludesign/services/AssetService';
import { assetDefinitionToMetadata } from '../../../components/bludesign/core/assetDefinitionToMetadata';

describe('assetDefinitionToMetadata', () => {
  it('maps backend fields into AssetMetadata', () => {
    const def: AssetDefinition = {
      id: 'custom-1',
      name: 'Locker',
      description: 'd',
      category: 'storage_unit',
      modelType: 'custom',
      globalModelId: 'gm-1',
      dimensions: { width: 2, height: 2, depth: 2 },
      gridUnits: { x: 2, z: 1 },
      isSmart: true,
      canRotate: true,
      canStack: false,
      isBuiltin: false,
      positionOffset: { x: 0.1, y: 0, z: -0.2 },
      createdAt: '',
      updatedAt: '',
    };

    const meta = assetDefinitionToMetadata(def);
    expect(meta.id).toBe('custom-1');
    expect(meta.category).toBe(AssetCategory.STORAGE_UNIT);
    expect(meta.metadata?.modelType).toBe('custom');
    expect(meta.metadata?.globalModelId).toBe('gm-1');
    expect(meta.metadata?.positionOffset).toEqual({ x: 0.1, y: 0, z: -0.2 });
  });
});
