import * as THREE from 'three';
import {
  resetToDefaultMaterials,
  storeDefaultMaterials,
} from '../../../../components/bludesign/core/skins/defaultMaterialPreservation';

describe('defaultMaterialPreservation', () => {
  it('storeDefaultMaterials clones materials onto mesh userData', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    const group = new THREE.Group();
    group.add(mesh);

    storeDefaultMaterials(group);

    expect(mesh.userData.originalMaterialsStored).toBe(true);
    expect(Array.isArray(mesh.userData.originalMaterialClones)).toBe(true);
    expect((mesh.userData.originalMaterialClones as THREE.Material[]).length).toBe(1);
  });

  it('resetToDefaultMaterials applies env map from deps when restoring clones', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const group = new THREE.Group();
    group.add(mesh);

    storeDefaultMaterials(group);

    const env = new THREE.CubeTexture([]);
    const getEnvironmentMap = jest.fn(() => env);

    mesh.material = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    resetToDefaultMaterials(group, { getEnvironmentMap });

    expect(getEnvironmentMap).toHaveBeenCalled();
    const applied = mesh.material as THREE.MeshStandardMaterial;
    expect(applied.envMap).toBe(env);
  });
});
