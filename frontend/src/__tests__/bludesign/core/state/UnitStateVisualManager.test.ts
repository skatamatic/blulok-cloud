import * as THREE from 'three';
import { AssetFactory } from '../../../../components/bludesign/assets/AssetFactory';
import {
  DOOR_ANIM_DURATION,
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
    expect(bodyMat(body).opacity).toBeCloseTo(0.66, 5);
    // Colour is dimmed below the themed base.
    expect(bodyMat(body).color.r).toBeLessThan(0.95);
  });

  it('builds a top-anchored roll-up rig with black backdrop when unlocked', () => {
    const mgr = new UnitStateVisualManager();
    const { group, door } = makeUnit();
    const originalCenterY = door.position.y;

    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.UNLOCKED });

    const rig = group.userData.unitDoorRig as {
      pivot: THREE.Group;
      door: THREE.Mesh;
      opening: THREE.Mesh;
    };
    expect(rig).toBeDefined();
    expect(door.parent).toBe(rig.pivot);
    expect(rig.opening.userData.unitStateOpening).toBe(true);
    expect((rig.opening.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x0a0a0a);
    expect(bodyMat(door).color.getHex()).toBe(0xf3f5f7);

    // Closed rig preserves the door center (alignment with the unit frame).
    rig.pivot.scale.y = 1;
    group.updateMatrixWorld(true);
    const centerAfter = new THREE.Vector3();
    door.getWorldPosition(centerAfter);
    const expected = new THREE.Vector3();
    door.parent!.parent!.updateMatrixWorld(true);
    group.localToWorld(new THREE.Vector3(0, originalCenterY, door.position.z), expected);
    expect(centerAfter.y).toBeCloseTo(originalCenterY, 4);

    for (let i = 0; i < 30; i++) mgr.update(DOOR_ANIM_DURATION / 30);
    expect(rig.pivot.scale.y).toBeLessThan(0.05);
    expect(rig.opening.visible).toBe(true);
  });

  it('animates open/close over one second on state changes', () => {
    const mgr = new UnitStateVisualManager();
    const { group } = makeUnit();
    const rig = () => group.userData.unitDoorRig as { pivot: THREE.Group };

    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.LOCKED });
    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.UNLOCKED });

    mgr.update(0.25);
    expect(rig().pivot.scale.y).toBeCloseTo(0.75, 2);

    mgr.update(0.75);
    expect(rig().pivot.scale.y).toBeLessThan(0.05);

    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.LOCKED });
    mgr.update(0.5);
    expect(rig().pivot.scale.y).toBeCloseTo(0.5, 2);
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
    for (let i = 0; i < 30; i++) mgr.update(DOOR_ANIM_DURATION / 30);
    mgr.applyState(group, { themed: true, bound: true, state: DeviceState.LOCKED });
    for (let i = 0; i < 30; i++) mgr.update(DOOR_ANIM_DURATION / 30);

    expect(bodyMat(body).transparent).toBe(false);
    expect(bodyMat(body).opacity).toBeCloseTo(1, 5);
    expect(bodyMat(body).emissive.getHex()).toBe(0x000000);
    expect(bodyMat(body).color.getHex()).toBe(0xf3f5f7);
    expect(bodyMat(door).color.getHex()).toBe(0xf3f5f7);
    expect(bodyMat(door).metalness).toBeCloseTo(doorBaseMetalness, 5);
    expect(bodyMat(door).roughness).toBeCloseTo(doorBaseRoughness, 5);

    const rig = group.userData.unitDoorRig as { pivot: THREE.Group; opening: THREE.Mesh };
    expect(rig.pivot.scale.y).toBeCloseTo(1, 3);
    expect(rig.opening.visible).toBe(false);
  });

  it('delegates non-themed units to the legacy flat-colour swap', () => {
    const mgr = new UnitStateVisualManager();
    const { group } = makeUnit();
    const spy = jest.spyOn(AssetFactory, 'updateAssetState').mockImplementation(() => {});

    mgr.applyState(group, { themed: false, bound: true, state: DeviceState.ERROR });
    expect(spy).toHaveBeenCalledWith(group, DeviceState.ERROR);

    expect(() => mgr.update(0.1)).not.toThrow();
    spy.mockRestore();
  });
});
