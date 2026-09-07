import * as THREE from 'three';
import { applyActiveCategorySkinFromTheme } from '../../../../components/bludesign/core/skins/activeThemeSkinApplication';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';
import type { CategorySkin } from '../../../../components/bludesign/core/SkinRegistry';
import { AssetCategory, BuildingSkinType } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';

function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 't',
    name: 'T',
    description: '',
    categorySkins: { [AssetCategory.STORAGE_UNIT]: 'skin-from-theme' },
    buildingSkin: BuildingSkinType.DEFAULT,
    environment: {
      grass: { color: '#000', metalness: 0, roughness: 1 },
      pavement: { color: '#000', metalness: 0, roughness: 1 },
      gravel: { color: '#000', metalness: 0, roughness: 1 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('applyActiveCategorySkinFromTheme', () => {
  it('applies theme skin when present', () => {
    const skin: CategorySkin = {
      id: 'skin-from-theme',
      name: 'S',
      category: AssetCategory.STORAGE_UNIT,
      partMaterials: {},
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const apply = jest.fn();
    const obj = new THREE.Object3D();
    obj.userData.category = AssetCategory.STORAGE_UNIT;

    applyActiveCategorySkinFromTheme(
      obj,
      undefined,
      theme(),
      (id) => (id === 'skin-from-theme' ? skin : undefined),
      apply
    );

    expect(apply).toHaveBeenCalledWith(obj, skin);
  });

  it('falls back to default skin id when theme has no entry', () => {
    const defaultSkin: CategorySkin = {
      id: 'skin-storage-unit-default',
      name: 'D',
      category: AssetCategory.STORAGE_UNIT,
      partMaterials: {},
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const apply = jest.fn();
    const placed = {
      assetMetadata: { category: AssetCategory.STORAGE_UNIT },
    } as PlacedObject;

    applyActiveCategorySkinFromTheme(
      new THREE.Object3D(),
      placed,
      theme({ categorySkins: {} }),
      (id) => (id === 'skin-storage-unit-default' ? defaultSkin : undefined),
      apply
    );

    expect(apply).toHaveBeenCalledWith(expect.any(Object), defaultSkin);
  });

  it('does nothing when category is missing', () => {
    const apply = jest.fn();
    applyActiveCategorySkinFromTheme(new THREE.Object3D(), undefined, theme(), () => undefined, apply);
    expect(apply).not.toHaveBeenCalled();
  });
});
