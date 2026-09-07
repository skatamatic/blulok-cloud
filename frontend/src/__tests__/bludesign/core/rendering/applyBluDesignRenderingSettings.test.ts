/**
 * Rendering settings application — pixel ratio, shadows, instancing, optimizer, frustum culling.
 */

import * as THREE from 'three';
import {
  applyAntialiasingSettings,
  applyBluDesignRenderingSettings,
  applyInstancingRenderingSettings,
  applyOptimizerRenderingSettings,
  applyRendererShadowMapEnabled,
  applyShadowRenderingSettings,
  configureDirectionalLightShadows,
  updateFrustumCullingOnSceneAndManagers,
  updateMeshShadowFlagsOnScene,
} from '../../../../components/bludesign/core/rendering/applyBluDesignRenderingSettings';
import type { EditorPreferences } from '../../../../components/bludesign/core/Preferences';

function baseRendering(overrides: Partial<EditorPreferences['rendering']> = {}): EditorPreferences['rendering'] {
  return {
    instancingEnabled: true,
    frustumCullingEnabled: true,
    occlusionCullingEnabled: false,
    optimizerEnabled: true,
    shadowsEnabled: true,
    shadowDistance: 500,
    shadowMapSize: 2048,
    antialiasingEnabled: true,
    antialiasingLevel: 2,
    showFPS: false,
    showGPUMemory: false,
    ...overrides,
  };
}

describe('applyAntialiasingSettings', () => {
  it('sets pixel ratio to min(dpr, level) when AA enabled', () => {
    const renderer = { setPixelRatio: jest.fn() };
    applyAntialiasingSettings(
      renderer,
      baseRendering({ antialiasingEnabled: true, antialiasingLevel: 4 }),
      () => 2
    );
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
  });

  it('uses antialiasingLevel default 2 when level is 0 in settings object edge case', () => {
    const renderer = { setPixelRatio: jest.fn() };
    applyAntialiasingSettings(
      renderer,
      baseRendering({ antialiasingEnabled: true, antialiasingLevel: 0 }),
      () => 8
    );
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(Math.min(8, 2));
  });

  it('sets pixel ratio to 1 when AA disabled', () => {
    const renderer = { setPixelRatio: jest.fn() };
    applyAntialiasingSettings(
      renderer,
      baseRendering({ antialiasingEnabled: false }),
      () => 3
    );
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
  });
});

describe('applyRendererShadowMapEnabled', () => {
  it('toggles renderer.shadowMap.enabled', () => {
    const renderer = { shadowMap: { enabled: false } };
    applyRendererShadowMapEnabled(renderer as THREE.WebGLRenderer, true);
    expect(renderer.shadowMap.enabled).toBe(true);
  });
});

describe('configureDirectionalLightShadows', () => {
  it('no-ops when light is missing', () => {
    expect(() =>
      configureDirectionalLightShadows(undefined, baseRendering({ shadowsEnabled: true }))
    ).not.toThrow();
  });

  it('sets castShadow and shadow map props when shadows enabled', () => {
    const light = new THREE.DirectionalLight(0xffffff);
    configureDirectionalLightShadows(
      light,
      baseRendering({
        shadowsEnabled: true,
        shadowMapSize: 1024,
        shadowDistance: 300,
      })
    );
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.width).toBe(1024);
    expect(light.shadow.mapSize.height).toBe(1024);
    expect(light.shadow.camera.far).toBe(300);
    expect(light.shadow.needsUpdate).toBe(true);
  });

  it('uses 500 for shadow camera far when shadowDistance is 0 (engine parity)', () => {
    const light = new THREE.DirectionalLight(0xffffff);
    configureDirectionalLightShadows(
      light,
      baseRendering({ shadowsEnabled: true, shadowDistance: 0 })
    );
    expect(light.shadow.camera.far).toBe(500);
  });

  it('sets castShadow false when shadows disabled', () => {
    const light = new THREE.DirectionalLight(0xffffff);
    light.castShadow = true;
    configureDirectionalLightShadows(light, baseRendering({ shadowsEnabled: false }));
    expect(light.castShadow).toBe(false);
  });
});

describe('updateMeshShadowFlagsOnScene', () => {
  it('skips meshes marked as ghost or selector or instance marker', () => {
    const scene = new THREE.Scene();
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    ghost.userData.isGhost = true;
    const selector = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    selector.userData.isSelector = true;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    marker.userData.isInstanceMarker = true;
    scene.add(ghost, selector, marker);

    updateMeshShadowFlagsOnScene(scene, true);
    expect(ghost.castShadow).toBe(false);
    expect(selector.castShadow).toBe(false);
    expect(marker.castShadow).toBe(false);
  });

  it('skips meshes with selectable false', () => {
    const scene = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    m.userData.selectable = false;
    scene.add(m);
    updateMeshShadowFlagsOnScene(scene, true);
    expect(m.castShadow).toBe(false);
  });

  it('sets cast and receive on normal meshes and instanced meshes', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    scene.add(mesh, inst);

    updateMeshShadowFlagsOnScene(scene, true);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(inst.castShadow).toBe(true);
    expect(inst.receiveShadow).toBe(true);

    updateMeshShadowFlagsOnScene(scene, false);
    expect(mesh.castShadow).toBe(false);
    expect(inst.castShadow).toBe(false);
  });
});

describe('applyShadowRenderingSettings', () => {
  it('wires renderer, directional light, and mesh traversal', () => {
    const renderer = {
      shadowMap: { enabled: false },
    } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const light = new THREE.DirectionalLight(0xffffff);
    const getLight = jest.fn(() => light);

    applyShadowRenderingSettings(renderer, scene, getLight, baseRendering({ shadowsEnabled: true }));

    expect(renderer.shadowMap.enabled).toBe(true);
    expect(light.castShadow).toBe(true);
    expect(mesh.castShadow).toBe(true);
  });
});

describe('applyInstancingRenderingSettings', () => {
  it('calls both managers', () => {
    const buildingManager = {
      setInstancingEnabled: jest.fn(),
      setFrustumCullingEnabled: jest.fn(),
    };
    const groundTileManager = {
      setInstancingEnabled: jest.fn(),
      setFrustumCullingEnabled: jest.fn(),
    };
    applyInstancingRenderingSettings(buildingManager, groundTileManager, false);
    expect(buildingManager.setInstancingEnabled).toHaveBeenCalledWith(false);
    expect(groundTileManager.setInstancingEnabled).toHaveBeenCalledWith(false);
  });
});

describe('applyOptimizerRenderingSettings', () => {
  it('awaits setEnabled and sets readonly mode', async () => {
    const optimizationManager = {
      setEnabled: jest.fn().mockResolvedValue(undefined),
      setReadonlyMode: jest.fn(),
    };
    await applyOptimizerRenderingSettings(optimizationManager, false, true);
    expect(optimizationManager.setEnabled).toHaveBeenCalledWith(false);
    expect(optimizationManager.setReadonlyMode).toHaveBeenCalledWith(true);
  });
});

describe('updateFrustumCullingOnSceneAndManagers', () => {
  it('only toggles frustumCulled on tagged InstancedMesh batches', () => {
    const scene = new THREE.Scene();
    const batched = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    batched.userData.isBatchedWalls = true;
    const other = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    other.frustumCulled = false;
    scene.add(batched, other);

    const buildingManager = {
      setInstancingEnabled: jest.fn(),
      setFrustumCullingEnabled: jest.fn(),
    };
    const groundTileManager = {
      setInstancingEnabled: jest.fn(),
      setFrustumCullingEnabled: jest.fn(),
    };

    updateFrustumCullingOnSceneAndManagers(scene, buildingManager, groundTileManager, true);
    expect(batched.frustumCulled).toBe(true);
    expect(other.frustumCulled).toBe(false);
    expect(buildingManager.setFrustumCullingEnabled).toHaveBeenCalledWith(true);
    expect(groundTileManager.setFrustumCullingEnabled).toHaveBeenCalledWith(true);
  });
});

describe('applyBluDesignRenderingSettings', () => {
  it('runs full pipeline: instancing → optimizer → readonly → frustum managers', async () => {
    const sequence: string[] = [];
    const renderer = {
      setPixelRatio: jest.fn(),
      shadowMap: { enabled: false },
    } as unknown as THREE.WebGLRenderer;

    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);

    await applyBluDesignRenderingSettings(
      {
        renderer,
        scene,
        getDirectionalLight: () => null,
        buildingManager: {
          setInstancingEnabled: () => sequence.push('inst-b'),
          setFrustumCullingEnabled: () => sequence.push('frus-b'),
        },
        groundTileManager: {
          setInstancingEnabled: () => sequence.push('inst-g'),
          setFrustumCullingEnabled: () => sequence.push('frus-g'),
        },
        optimizationManager: {
          setEnabled: async () => {
            sequence.push('opt');
          },
          setReadonlyMode: () => sequence.push('ro'),
        },
        readonly: true,
        getDevicePixelRatio: () => 1,
      },
      baseRendering({
        antialiasingEnabled: false,
        shadowsEnabled: false,
        instancingEnabled: true,
        optimizerEnabled: true,
        frustumCullingEnabled: true,
      })
    );

    expect(sequence).toEqual(['inst-b', 'inst-g', 'opt', 'ro', 'frus-b', 'frus-g']);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
  });
});
