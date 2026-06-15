import * as THREE from 'three';
import { AssetFactory } from '../../../../components/bludesign/assets/AssetFactory';
import {
  UnitStateVisualManager,
} from '../../../../components/bludesign/core/state/UnitStateVisualManager';
import { DeviceState } from '../../../../components/bludesign/core/types';

function makeUnit(): {
  group: THREE.Group;
  body: THREE.Mesh;
  door: THREE.Mesh;
  roof: THREE.Mesh;
} {
  const group = new THREE.Group();
  // Units must live in the scene graph; the manager evicts detached groups.
  new THREE.Scene().add(group);
  const mk = (part: string, geo: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf3f5f7 }));
    mesh.userData.partName = part;
    group.add(mesh);
    return mesh;
  };
  const body = mk('body', new THREE.BoxGeometry(2, 2, 2));
  body.position.y = 1;
  const door = mk('door', new THREE.BoxGeometry(1.2, 1.4, 0.05));
  door.position.set(0, 0.7, 1.025);
  const roof = mk('roof', new THREE.BoxGeometry(2.1, 0.3, 2.1));
  roof.position.y = 2.15;
  return { group, body, door, roof };
}

const bodyMat = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial;

describe('UnitStateVisualManager', () => {
  it('dims and makes unbound themed units transparent', () => {
    const mgr = new UnitStateVisualManager();
    const { group, body } = makeUnit();

    mgr.applyState(group, { themed: true, bound: false, state: DeviceState.UNKNOWN });

    expect(bodyMat(body).transparent).toBe(true);
    expect(bodyMat(body).opacity).toBeCloseTo(0.9, 5);
    // Colour is dimmed below the themed base.
    expect(bodyMat(body).color.r).toBeLessThan(0.95);
  });

  it('opens the door (black) for unlocked bound units', () => {
    const mgr = new UnitStateVisualManager();
    const { group, door } = makeUnit();

    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.UNLOCKED });

    // A hinge pivot is created and the door reparented under it.
    const pivot = group.userData.unitDoorPivot as THREE.Object3D | undefined;
    expect(pivot).toBeDefined();
    expect(door.parent).toBe(pivot);
    // Door reads black.
    expect(bodyMat(door).color.getHex()).toBe(0x0a0a0a);

    // The swing animates toward the open angle over a few frames.
    pivot!.rotation.y = 0;
    for (let i = 0; i < 30; i++) mgr.update(0.1);
    expect(Math.abs(pivot!.rotation.y)).toBeGreaterThan(0.5);
  });

  it('flashes red for error and animates emissive intensity', () => {
    const mgr = new UnitStateVisualManager();
    const { group, body } = makeUnit();

    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.ERROR });
    expect(bodyMat(body).emissive.getHex()).toBe(0xff2a2a);

    mgr.update(0.0); // pulse at t=0 → sin(0)=0 → mid-low
    const a = bodyMat(body).emissiveIntensity;
    mgr.update(0.15); // advance phase
    const b = bodyMat(body).emissiveIntensity;
    expect(a).not.toBeCloseTo(b, 5);
    expect(b).toBeGreaterThanOrEqual(0.05);
    expect(b).toBeLessThanOrEqual(1);
  });

  it('flashes yellow for unknown bound units', () => {
    const mgr = new UnitStateVisualManager();
    const { group, body } = makeUnit();
    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.UNKNOWN });
    expect(bodyMat(body).emissive.getHex()).toBe(0xffc400);
  });

  it('restores the pristine themed look when returning to locked', () => {
    const mgr = new UnitStateVisualManager();
    const { group, body, door } = makeUnit();
    const doorBaseMetalness = bodyMat(door).metalness;
    const doorBaseRoughness = bodyMat(door).roughness;

    mgr.applyState(group, { themed: true, bound: false, state: DeviceState.UNKNOWN });
    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.ERROR });
    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.UNLOCKED });
    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.LOCKED });

    expect(bodyMat(body).transparent).toBe(false);
    expect(bodyMat(body).opacity).toBeCloseTo(1, 5);
    // Emissive returns to its (black) base, so the unit no longer glows.
    expect(bodyMat(body).emissive.getHex()).toBe(0x000000);
    expect(bodyMat(body).color.getHex()).toBe(0xf3f5f7);
    // The door fully restores (incl. metalness/roughness changed while open).
    expect(bodyMat(door).color.getHex()).toBe(0xf3f5f7);
    expect(bodyMat(door).metalness).toBeCloseTo(doorBaseMetalness, 5);
    expect(bodyMat(door).roughness).toBeCloseTo(doorBaseRoughness, 5);
  });

  it('delegates non-themed units to the legacy flat-colour swap', () => {
    const mgr = new UnitStateVisualManager();
    const { group } = makeUnit();
    const spy = jest.spyOn(AssetFactory, 'updateAssetState').mockImplementation(() => {});

    mgr.applyState(group, { themed: false, bound: true, state: DeviceState.ERROR });
    expect(spy).toHaveBeenCalledWith(group, DeviceState.ERROR);

    // No flashing entry registered → update is a no-op for non-themed units.
    expect(() => mgr.update(0.1)).not.toThrow();
    spy.mockRestore();
  });
});
