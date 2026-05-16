import * as THREE from 'three';
import { applyThemeToPlacedSceneObjects } from '../../../../components/bludesign/core/theme/sceneThemePlacedObjects';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';
import { AssetCategory, BuildingSkinType } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';
import type { CategorySkin } from '../../../../components/bludesign/core/SkinRegistry';

function baseTheme(): Theme {
  return {
    id: 't',
    name: 'T',
    description: '',
    categorySkins: { [AssetCategory.STORAGE_UNIT]: 'skin-a' },
    buildingSkin: BuildingSkinType.DEFAULT,
    environment: {
      grass: { color: '#000', metalness: 0, roughness: 1 },
      pavement: { color: '#000', metalness: 0, roughness: 1 },
      gravel: { color: '#000', metalness: 0, roughness: 1 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('applyThemeToPlacedSceneObjects', () => {
  it('skips grid/ground userData', () => {
    const applySkin = jest.fn();
    const grid = new THREE.Object3D();
    grid.userData.isGrid = true;
    const ground = new THREE.Object3D();
    ground.userData.isGround = true;

    applyThemeToPlacedSceneObjects(baseTheme(), {
      getAllObjectEntries: () => [
        ['g', grid],
        ['gr', ground],
      ],
      getObjectData: () => undefined,
      getSkin: () => undefined,
      applySkinToObject: applySkin,
    });

    expect(applySkin).not.toHaveBeenCalled();
  });

  it('applies override skin when objectData.skinId resolves', () => {
    const skin: CategorySkin = {
      id: 'ov',
      name: 'O',
      category: AssetCategory.STORAGE_UNIT,
      partMaterials: {},
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mesh = new THREE.Object3D();
    mesh.userData.assetId = 'x';
    const applySkin = jest.fn();
    const od: PlacedObject = {
      skinId: 'ov',
      assetMetadata: { category: AssetCategory.STORAGE_UNIT },
    } as PlacedObject;

    applyThemeToPlacedSceneObjects(baseTheme(), {
      getAllObjectEntries: () => [['1', mesh]],
      getObjectData: () => od,
      getSkin: (id) => (id === 'ov' ? skin : undefined),
      applySkinToObject: applySkin,
    });

    expect(applySkin).toHaveBeenCalledWith(mesh, skin);
  });
});
