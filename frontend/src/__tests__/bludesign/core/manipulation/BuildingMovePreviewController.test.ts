/**
 * Building drag preview — scene graph, instance count, hide/dispose.
 */

import * as THREE from 'three';
import { BuildingMovePreviewController } from '../../../../components/bludesign/core/manipulation/BuildingMovePreviewController';

describe('BuildingMovePreviewController', () => {
  function makeController() {
    const scene = new THREE.Scene();
    const gridSystem = {
      getGridSize: jest.fn(() => 1),
      gridToWorld: jest.fn(({ x, z }: { x: number; z: number }) => new THREE.Vector3(x, 0, z)),
    };
    const getFloorY = jest.fn(() => 0.25);
    const c = new BuildingMovePreviewController({ scene, gridSystem, getFloorY });
    return { scene, gridSystem, getFloorY, c };
  }

  const footprint = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

  it('adds instanced tiles and outline to scene on show', () => {
    const { scene, c } = makeController();
    c.show([footprint], 0, 0, 0);
    const instanced = scene.children.filter((o) => o instanceof THREE.InstancedMesh);
    const lines = scene.children.filter((o) => o instanceof THREE.LineSegments);
    expect(instanced).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect((instanced[0] as THREE.InstancedMesh).count).toBe(1);
  });

  it('hide sets visibility without removing from scene', () => {
    const { scene, c } = makeController();
    c.show([footprint], 0, 0, 0);
    c.hide();
    const instanced = scene.children.find((o) => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const lines = scene.children.find((o) => o instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(instanced.visible).toBe(false);
    expect(lines.visible).toBe(false);
  });

  it('recreates instanced mesh when cell count changes', () => {
    const { scene, c } = makeController();
    c.show([footprint], 0, 0, 0);
    const first = scene.children.find((o) => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const wide = { minX: 0, maxX: 1, minZ: 0, maxZ: 0 };
    c.show([wide], 0, 0, 0);
    const second = scene.children.find((o) => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(second).not.toBe(first);
    expect(second.count).toBe(2);
  });

  it('dispose removes all preview objects from scene', () => {
    const { scene, c } = makeController();
    c.show([footprint], 0, 0, 0);
    c.dispose();
    expect(scene.children.filter((o) => o.userData?.isPreview)).toHaveLength(0);
  });

  it('show with zero cells hides', () => {
    const { scene, c } = makeController();
    c.show([], 0, 0, 0);
    expect(scene.children.length).toBe(0);
  });
});
