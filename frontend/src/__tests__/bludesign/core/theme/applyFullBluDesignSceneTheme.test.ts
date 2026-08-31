import * as THREE from 'three';
import { applyFullBluDesignSceneTheme } from '../../../../components/bludesign/core/theme/applyFullBluDesignSceneTheme';
import { BuildingSkinType } from '../../../../components/bludesign/core/types';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';
import type { PartMaterial } from '../../../../components/bludesign/core/types';

const pm: PartMaterial = {
  color: '#cccccc',
  metalness: 0,
  roughness: 1,
};

function minimalTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 't-test',
    name: 'Test',
    description: '',
    categorySkins: {},
    buildingSkin: BuildingSkinType.DEFAULT,
    environment: {
      grass: pm,
      pavement: pm,
      gravel: pm,
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('applyFullBluDesignSceneTheme', () => {
  it('applies building materials, walks placed objects, environment, and ghosting in floor mode', () => {
    const applyBuildingMaterials = jest.fn();
    const applyGhosting = jest.fn();
    const updateMaterial = jest.fn();

    const theme = minimalTheme();

    applyFullBluDesignSceneTheme(theme, {
      getSkin: () => undefined,
      buildingManager: { applyBuildingMaterials },
      sceneManager: {
        getAllObjects: () => new Map<string, THREE.Object3D>(),
        getObjectData: () => undefined,
      },
      groundTileManager: { updateMaterial },
      scene: new THREE.Scene(),
      isFloorMode: true,
      floorManager: { applyGhosting },
      applySkinToObject: jest.fn(),
    });

    expect(applyBuildingMaterials).toHaveBeenCalled();
    expect(updateMaterial).toHaveBeenCalled();
    expect(applyGhosting).toHaveBeenCalled();
  });

  it('skips floor ghosting when not in floor mode', () => {
    const applyGhosting = jest.fn();

    applyFullBluDesignSceneTheme(minimalTheme(), {
      getSkin: () => undefined,
      buildingManager: { applyBuildingMaterials: jest.fn() },
      sceneManager: {
        getAllObjects: () => new Map(),
        getObjectData: () => undefined,
      },
      groundTileManager: { updateMaterial: jest.fn() },
      scene: new THREE.Scene(),
      isFloorMode: false,
      floorManager: { applyGhosting },
      applySkinToObject: jest.fn(),
    });

    expect(applyGhosting).not.toHaveBeenCalled();
  });
});
