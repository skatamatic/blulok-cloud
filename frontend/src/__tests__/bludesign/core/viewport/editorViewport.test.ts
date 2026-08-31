import * as THREE from 'three';
import {
  computeBluDesignSceneBounds,
  computeFocusOrbitForPlacedObjectMesh,
  computeObjectScreenBounds,
  computeFocusOrbitForBuilding,
} from '../../../../components/bludesign/core/viewport/editorViewport';
import type { Building } from '../../../../components/bludesign/core/types';

describe('editorViewport', () => {
  describe('computeBluDesignSceneBounds', () => {
    it('expands to default bounds when there is no content', () => {
      const b = computeBluDesignSceneBounds({
        getAllPlacedObjects: () => [],
        getObjectMesh: () => undefined,
        getAllBuildings: () => [],
        gridToWorld: (p) => new THREE.Vector3(p.x, p.y ?? 0, p.z),
        getGridSize: () => 1,
      });
      expect(b.isEmpty()).toBe(false);
      expect(b.min.y).toBe(0);
    });
  });

  describe('computeFocusOrbitForPlacedObjectMesh', () => {
    it('returns a camera position offset from the object center', () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
      mesh.position.set(5, 1, 3);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      camera.position.set(10, 10, 10);
      camera.lookAt(5, 1, 3);
      const { center, newCameraPos } = computeFocusOrbitForPlacedObjectMesh(mesh, camera);
      expect(center.x).toBeCloseTo(5);
      expect(center.z).toBeCloseTo(3);
      expect(newCameraPos.distanceTo(center)).toBeGreaterThan(11);
    });
  });

  describe('computeFocusOrbitForBuilding', () => {
    it('returns null when there are no footprints', () => {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      const building = {
        footprints: [],
        floors: [],
      } as unknown as Building;
      expect(computeFocusOrbitForBuilding(building, 1, camera)).toBeNull();
    });

    it('computes center from footprint grid extents', () => {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      camera.position.set(20, 20, 20);
      camera.lookAt(0, 0, 0);
      const building: Building = {
        id: 'b1',
        footprints: [{ minX: 0, maxX: 2, minZ: 0, maxZ: 0 }],
        floors: [{ level: 0 }],
      } as unknown as Building;
      const orbit = computeFocusOrbitForBuilding(building, 2, camera);
      expect(orbit).not.toBeNull();
      expect(orbit!.center.x).toBeCloseTo(2);
      expect(orbit!.center.z).toBeCloseTo(0);
    });
  });

  describe('computeObjectScreenBounds', () => {
    it('returns positive width and height for a visible mesh', () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      const camera = new THREE.PerspectiveCamera(50, 400 / 600, 0.1, 100);
      camera.position.set(0, 0, 5);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      const r = computeObjectScreenBounds(mesh, camera, 800, 600);
      expect(r.width).toBeGreaterThan(10);
      expect(r.height).toBeGreaterThan(10);
    });
  });
});
