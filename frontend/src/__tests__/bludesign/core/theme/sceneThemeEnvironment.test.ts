import * as THREE from 'three';
import { applySceneThemeEnvironment } from '../../../../components/bludesign/core/theme/sceneThemeEnvironment';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';
import { AssetCategory, BuildingSkinType } from '../../../../components/bludesign/core/types';

describe('applySceneThemeEnvironment', () => {
  it('updates ground mesh grass and tile manager categories', () => {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff' })
    );
    ground.userData.isGround = true;

    const scene = new THREE.Scene();
    scene.add(ground);

    const updateMaterial = jest.fn();

    const theme: Theme = {
      id: 't',
      name: 'T',
      description: '',
      categorySkins: {},
      buildingSkin: BuildingSkinType.DEFAULT,
      environment: {
        grass: { color: '#112233', metalness: 0.1, roughness: 0.2 },
        pavement: { color: '#445566', metalness: 0, roughness: 1 },
        gravel: { color: '#778899', metalness: 0, roughness: 1 },
      },
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    applySceneThemeEnvironment(theme, {
      scene,
      groundTileManager: { updateMaterial },
    });

    const mat = ground.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe('112233');
    expect(updateMaterial).toHaveBeenCalledWith(AssetCategory.PAVEMENT, theme.environment.pavement);
    expect(updateMaterial).toHaveBeenCalledWith(AssetCategory.GRASS, theme.environment.grass);
    expect(updateMaterial).toHaveBeenCalledWith(AssetCategory.GRAVEL, theme.environment.gravel);
  });
});
