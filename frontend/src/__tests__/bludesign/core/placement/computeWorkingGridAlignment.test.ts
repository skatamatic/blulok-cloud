import * as THREE from 'three';
import { computeWorkingGridAlignmentFromPlacedMesh } from '../../../../components/bludesign/core/placement/computeWorkingGridAlignment';
import { Orientation, type PlacedObject } from '../../../../components/bludesign/core/types';

function placed(overrides: Partial<PlacedObject>): PlacedObject {
  return {
    id: 'o1',
    assetId: 'a1',
    name: 'O',
    position: { x: 0, z: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: {
      gridUnits: { x: 1, z: 1 },
      category: 'unit',
    } as PlacedObject['assetMetadata'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('computeWorkingGridAlignmentFromPlacedMesh', () => {
  it('yaw equals full world rotation from PlacedObject.rotation', () => {
    const mesh = new THREE.Group();
    mesh.position.set(3, 0, 4);
    mesh.rotation.y = Math.PI / 4;
    mesh.updateMatrixWorld(true);

    const po = placed({ orientation: Orientation.NORTH, rotation: Math.PI / 4 });
    const a = computeWorkingGridAlignmentFromPlacedMesh(mesh, po, 1);

    expect(Math.abs(a.yaw)).toBeCloseTo(Math.PI / 4);
  });

  it('yaw equals full cardinal rotation for pure EAST', () => {
    const mesh = new THREE.Group();
    mesh.position.set(0, 0, 0);
    mesh.rotation.y = Math.PI / 2;
    mesh.updateMatrixWorld(true);

    const po = placed({ orientation: Orientation.EAST });
    const a = computeWorkingGridAlignmentFromPlacedMesh(mesh, po, 1);

    expect(a.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('origin is min-corner of footprint in world space (no position dependency)', () => {
    const gs = 0.6096;
    const mesh = new THREE.Group();
    mesh.position.set(5, 0, 5);
    mesh.rotation.y = 0;
    mesh.updateMatrixWorld(true);

    const po = placed({
      orientation: Orientation.NORTH,
      position: { x: 999, z: 888 },
      assetMetadata: { gridUnits: { x: 2, z: 3 }, category: 'unit' } as PlacedObject['assetMetadata'],
    });
    const a = computeWorkingGridAlignmentFromPlacedMesh(mesh, po, gs);

    expect(a.yaw).toBeCloseTo(0);
    expect(a.originX).toBeCloseTo(5 - (2 / 2) * gs);
    expect(a.originZ).toBeCloseTo(5 - (3 / 2) * gs);
  });

  it('subtracts internal pivot offsets from mesh position', () => {
    const mesh = new THREE.Group();
    mesh.userData.internalXOffset = 0.2;
    mesh.userData.internalZOffset = -0.1;
    mesh.position.set(3.2, 0, 3.9);
    mesh.rotation.y = 0;
    mesh.updateMatrixWorld(true);

    const po = placed({
      orientation: Orientation.NORTH,
      position: { x: 3, z: 4 },
    });
    const gs = 1;
    const a = computeWorkingGridAlignmentFromPlacedMesh(mesh, po, gs);

    const fcX = 3.2 - 0.2;
    const fcZ = 3.9 - (-0.1);
    expect(a.originX).toBeCloseTo(fcX - 0.5);
    expect(a.originZ).toBeCloseTo(fcZ - 0.5);
    expect(a.yaw).toBeCloseTo(0);
  });

  it('origin half-extent uses Three.js Y-rotation convention (x=u*c+v*s, z=-u*s+v*c)', () => {
    const gs = 1;
    const mesh = new THREE.Group();
    mesh.position.set(0, 0, 0);
    mesh.rotation.y = Math.PI / 2;
    mesh.updateMatrixWorld(true);

    const po = placed({
      orientation: Orientation.EAST,
      assetMetadata: { gridUnits: { x: 2, z: 4 }, category: 'unit' } as PlacedObject['assetMetadata'],
    });
    const a = computeWorkingGridAlignmentFromPlacedMesh(mesh, po, gs);

    const yaw = Math.PI / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const halfU = (4 / 2) * gs;
    const halfV = (2 / 2) * gs;
    const halfWorldX = halfU * c + halfV * s;
    const halfWorldZ = -halfU * s + halfV * c;

    expect(a.originX).toBeCloseTo(0 - halfWorldX);
    expect(a.originZ).toBeCloseTo(0 - halfWorldZ);
  });
});
