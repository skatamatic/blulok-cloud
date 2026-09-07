import * as THREE from 'three';
import { AssetCategory } from '../../../../components/bludesign/core/types';
import type { CategorySkin } from '../../../../components/bludesign/core/SkinRegistry';
import { createPlacedObjectSkinApplicator } from '../../../../components/bludesign/core/skins/placedObjectSkinApplicator';
import * as skinMaterialApplicator from '../../../../components/bludesign/core/skins/skinMaterialApplicator';

describe('createPlacedObjectSkinApplicator', () => {
  it('routes applySkinToObject through applyCategorySkinToObjectGroup with loadTexture', () => {
    const spy = jest
      .spyOn(skinMaterialApplicator, 'applyCategorySkinToObjectGroup')
      .mockImplementation(() => {});

    const texture = new THREE.Texture();
    const { applySkinToObject } = createPlacedObjectSkinApplicator({
      loadTexture: () => texture,
    });

    const group = new THREE.Group();
    const skin: CategorySkin = {
      id: 'skin-test',
      name: 'Test',
      category: AssetCategory.STORAGE_UNIT,
      partMaterials: {},
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    applySkinToObject(group, skin);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      group,
      skin,
      expect.objectContaining({
        loadTexture: expect.any(Function),
      })
    );
    const call = spy.mock.calls[0][2] as { loadTexture: (u: string) => THREE.Texture };
    expect(call.loadTexture('http://x')).toBe(texture);

    spy.mockRestore();
  });
});
