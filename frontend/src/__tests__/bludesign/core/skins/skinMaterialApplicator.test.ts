import * as THREE from 'three';
import { applyCategorySkinToObjectGroup } from '../../../../components/bludesign/core/skins/skinMaterialApplicator';
import type { CategorySkin } from '../../../../components/bludesign/core/SkinRegistry';
import { AssetCategory } from '../../../../components/bludesign/core/types';

describe('applyCategorySkinToObjectGroup', () => {
  it('clones material and applies color from skin part', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff' })
    );
    mesh.userData.partName = 'body';

    const group = new THREE.Group();
    group.add(mesh);

    const skin: CategorySkin = {
      id: 's',
      name: 'S',
      category: AssetCategory.STORAGE_UNIT,
      partMaterials: {
        body: { color: '#147fd4', metalness: 0.1, roughness: 0.5 },
      },
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const loadTexture = jest.fn();
    applyCategorySkinToObjectGroup(group, skin, {
      loadTexture,
    });

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.userData.isClonedForSkin).toBe(true);
    expect(mat.color.getHexString().toLowerCase()).toBe('147fd4');
  });
});
