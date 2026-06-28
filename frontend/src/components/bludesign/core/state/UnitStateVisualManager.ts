/**
 * Drives runtime state-based visuals for storage units, with a small reusable
 * per-frame animation system for the time-based effects (flashing + garage door).
 *
 * Behaviour only kicks in for units wearing the built-in "White & Blue Steel"
 * theme ({@link THEMED_UNIT_SKIN_ID}); every other asset falls back to the
 * legacy flat-colour {@link AssetFactory.updateAssetState} swap so existing
 * behaviour is untouched.
 *
 * Themed unit appearance, driven by binding + {@link DeviceState}:
 *  - not bound      → slightly dimmer + ~66% opacity (subtle translucency)
 *  - locked (bound) → the plain themed look
 *  - unlocked       → garage-style roll-up: door shrinks upward, black opening behind
 *  - error          → the whole unit flashes an alarming red tint
 *  - unknown        → the whole unit flashes an alarming yellow tint
 *
 * The manager is ticked once per frame from the engine render loop via
 * {@link update}. Material base values are snapshotted lazily into a WeakMap so
 * transitions always restore the exact themed look (and re-skinning, which
 * produces fresh material clones, transparently re-snapshots).
 */

import * as THREE from 'three';
import { AssetFactory } from '../../assets/AssetFactory';
import { DeviceState } from '../types';

/** The built-in skin these state visuals apply to. */
export const THEMED_UNIT_SKIN_ID = 'skin-unit-white-blue';

export interface UnitVisualStateParams {
  /** Whether the unit is wearing {@link THEMED_UNIT_SKIN_ID}. */
  themed: boolean;
  /** Whether the unit is bound to a real entity (has an entityId). */
  bound: boolean;
  /** Current device/lock state. */
  state: DeviceState;
}

interface MaterialBase {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/** Garage-door rig cached on the unit group (see {@link ensureDoorRig}). */
export interface UnitDoorRig {
  pivot: THREE.Group;
  door: THREE.Mesh;
  opening: THREE.Mesh;
}

interface UnitVisualEntry {
  group: THREE.Group;
  /** Materials that pulse while flashing (null colour ⇒ no flash). */
  flashColor: THREE.Color | null;
  flashMaterials: THREE.MeshStandardMaterial[];
  doorRig: UnitDoorRig | null;
  /** Target open amount: 0 = closed, 1 = fully open. */
  doorTargetOpen: number;
  /** Animated open amount (lerped in {@link update}). */
  doorCurrentOpen: number;
}

const FLASH_RED = 0xff2a2a;
const FLASH_YELLOW = 0xffc400;
const FLASH_SPEED = 5.2; // rad/s ≈ 0.8 Hz
const FLASH_MIN = 0.06;
const FLASH_MAX = 0.95;

/** Full open/close transition duration (seconds). */
export const DOOR_ANIM_DURATION = 1;
const DOOR_BLACK = 0x0a0a0a;
const OPENING_INSET = 0.025;

const UNBOUND_OPACITY = 0.66;
const UNBOUND_DIM = 0.15; // slight darkening of the themed colour

export class UnitStateVisualManager {
  private readonly entries = new Map<string, UnitVisualEntry>();
  private readonly materialBases = new WeakMap<THREE.MeshStandardMaterial, MaterialBase>();
  private elapsed = 0;

  /** Apply the visual state for a single unit group. */
  applyState(group: THREE.Group, params: UnitVisualStateParams): void {
    if (!params.themed) {
      // Legacy assets (and themed units that left the theme) use the flat swap.
      this.releaseGroup(group, /* keepPivotClosed */ true);
      AssetFactory.updateAssetState(group, params.state);
      return;
    }
    this.applyThemedState(group, params.bound, params.state);
  }

  /** Per-frame tick: advances flashing emissive and garage-door animation. */
  update(delta: number): void {
    if (this.entries.size === 0) return;
    this.elapsed += delta;
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * FLASH_SPEED);
    const flashIntensity = FLASH_MIN + (FLASH_MAX - FLASH_MIN) * pulse;

    for (const [key, entry] of this.entries) {
      // Auto-evict units that were removed from the scene graph.
      if (!entry.group.parent) {
        this.entries.delete(key);
        continue;
      }

      if (entry.flashColor) {
        for (const mat of entry.flashMaterials) {
          mat.emissiveIntensity = flashIntensity;
        }
      }

      if (entry.doorRig) {
        this.stepDoorAnimation(entry, delta);
        this.applyDoorRigVisual(entry.doorRig, entry.doorCurrentOpen);
      }
    }
  }

  dispose(): void {
    this.entries.clear();
  }

  // ----------------------------------------------------------------------------

  private applyThemedState(group: THREE.Group, bound: boolean, state: DeviceState): void {
    const doorRig = this.ensureDoorRig(group);
    const bodyRoofMats = this.collectMaterials(group, ['body', 'roof']);
    const doorMats = this.collectMaterials(group, ['door']);
    const allMats = [...bodyRoofMats, ...doorMats];

    // Always start from the pristine themed look, then layer the state on top.
    for (const mat of allMats) this.resetToBase(mat);

    let flashColor: THREE.Color | null = null;
    let doorTargetOpen = 0;

    if (!bound) {
      // No live data → ghostly, dim and mostly transparent.
      for (const mat of allMats) this.applyDim(mat);
    } else {
      switch (state) {
        case DeviceState.UNLOCKED:
          doorTargetOpen = 1;
          break;
        case DeviceState.ERROR:
          flashColor = new THREE.Color(FLASH_RED);
          break;
        case DeviceState.UNKNOWN:
          flashColor = new THREE.Color(FLASH_YELLOW);
          break;
        // LOCKED / MAINTENANCE / OFFLINE / default → plain themed look.
        default:
          break;
      }
    }

    const flashMaterials: THREE.MeshStandardMaterial[] = [];
    if (flashColor) {
      for (const mat of allMats) {
        mat.emissive.copy(flashColor);
        mat.emissiveIntensity = FLASH_MIN;
        mat.needsUpdate = true;
        flashMaterials.push(mat);
      }
    }

    const prev = this.entries.get(group.uuid);
    let doorCurrentOpen = prev?.doorCurrentOpen ?? doorTargetOpen;
    if (prev && prev.doorTargetOpen !== doorTargetOpen) {
      doorCurrentOpen = prev.doorCurrentOpen;
    }

    this.entries.set(group.uuid, {
      group,
      flashColor,
      flashMaterials,
      doorRig: doorRig ?? null,
      doorTargetOpen,
      doorCurrentOpen,
    });

    if (doorRig) {
      this.applyDoorRigVisual(doorRig, doorCurrentOpen);
    }
  }

  /** Restore base materials and close the door; optionally keep the entry gone. */
  private releaseGroup(group: THREE.Group, keepPivotClosed: boolean): void {
    const entry = this.entries.get(group.uuid);
    if (!entry && !keepPivotClosed) return;

    const mats = this.collectMaterials(group, ['body', 'roof', 'door']);
    for (const mat of mats) {
      if (this.materialBases.has(mat)) this.resetToBase(mat);
    }

    const rig = group.userData.unitDoorRig as UnitDoorRig | undefined;
    if (rig) {
      rig.pivot.scale.y = 1;
      rig.door.visible = true;
      rig.opening.visible = false;
    }

    this.entries.delete(group.uuid);
  }

  private stepDoorAnimation(entry: UnitVisualEntry, delta: number): void {
    const diff = entry.doorTargetOpen - entry.doorCurrentOpen;
    if (Math.abs(diff) <= 1e-4) {
      entry.doorCurrentOpen = entry.doorTargetOpen;
      return;
    }
    const step = delta / DOOR_ANIM_DURATION;
    entry.doorCurrentOpen += Math.sign(diff) * Math.min(Math.abs(diff), step);
  }

  /** Shrink the door panel upward; reveal the black opening behind it. */
  private applyDoorRigVisual(rig: UnitDoorRig, openAmount: number): void {
    const t = THREE.MathUtils.clamp(openAmount, 0, 1);
    const closedScale = Math.max(0.001, 1 - t);
    rig.pivot.scale.y = closedScale;
    rig.door.visible = t < 0.999;
    rig.opening.visible = t > 0.001;
  }

  private collectMaterials(
    group: THREE.Group,
    partNames: string[]
  ): THREE.MeshStandardMaterial[] {
    const result: THREE.MeshStandardMaterial[] = [];
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.unitStateOpening) return;
      const part = child.userData.partName as string | undefined;
      if (!part || !partNames.includes(part)) return;
      const mat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        this.ensureBase(mat);
        result.push(mat);
      }
    });
    return result;
  }

  /** Snapshot a material's pristine themed values the first time we see it. */
  private ensureBase(mat: THREE.MeshStandardMaterial): void {
    if (this.materialBases.has(mat)) return;
    this.materialBases.set(mat, {
      color: mat.color.getHex(),
      emissive: mat.emissive.getHex(),
      emissiveIntensity: mat.emissiveIntensity,
      metalness: mat.metalness,
      roughness: mat.roughness,
      opacity: mat.opacity,
      transparent: mat.transparent,
      depthWrite: mat.depthWrite,
    });
  }

  private resetToBase(mat: THREE.MeshStandardMaterial): void {
    const base = this.materialBases.get(mat);
    if (!base) return;
    mat.color.setHex(base.color);
    mat.emissive.setHex(base.emissive);
    mat.emissiveIntensity = base.emissiveIntensity;
    mat.metalness = base.metalness;
    mat.roughness = base.roughness;
    mat.opacity = base.opacity;
    mat.transparent = base.transparent;
    mat.depthWrite = base.depthWrite;
    mat.needsUpdate = true;
  }

  private applyDim(mat: THREE.MeshStandardMaterial): void {
    const base = this.materialBases.get(mat);
    if (base) mat.color.setHex(base.color).multiplyScalar(UNBOUND_DIM);
    mat.transparent = true;
    mat.opacity = UNBOUND_OPACITY;
    mat.depthWrite = false;
    mat.needsUpdate = true;
  }

  private findDoorMesh(group: THREE.Group): THREE.Mesh | undefined {
    let door: THREE.Mesh | undefined;
    group.traverse((child) => {
      if (!door && child instanceof THREE.Mesh && child.userData.partName === 'door') {
        door = child;
      }
    });
    return door;
  }

  /**
   * Builds a bottom-anchored garage-door rig: the door panel scales down on Y
   * while a black opening mesh behind it is revealed. Idempotent — cached on
   * {@link THREE.Object3D.userData.unitDoorRig}. Migrates legacy swing pivots.
   */
  private ensureDoorRig(group: THREE.Group): UnitDoorRig | undefined {
    const cached = group.userData.unitDoorRig as UnitDoorRig | undefined;
    if (cached?.pivot && cached.door && cached.opening) return cached;

    this.teardownLegacySwingPivot(group);

    const door = this.findDoorMesh(group);
    if (!door || door.parent !== group) return undefined;

    door.geometry.computeBoundingBox();
    const bbox = door.geometry.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const doorBottomY = door.position.y + bbox.min.y;
    const openingPos = door.position.clone();

    const pivot = new THREE.Group();
    pivot.name = 'UnitDoorGaragePivot';
    pivot.position.set(door.position.x, doorBottomY, door.position.z);

    group.remove(door);
    door.position.set(0, -bbox.min.y, 0);
    pivot.add(door);
    group.add(pivot);

    const openingGeo = door.geometry.clone();
    const openingMat = new THREE.MeshStandardMaterial({
      color: DOOR_BLACK,
      metalness: 0.1,
      roughness: 0.95,
    });
    const opening = new THREE.Mesh(openingGeo, openingMat);
    opening.name = 'UnitDoorOpening';
    opening.userData.unitStateOpening = true;
    opening.castShadow = false;
    opening.receiveShadow = false;
    opening.position.copy(openingPos);
    this.insetOpeningTowardUnitInterior(opening, openingPos, size);
    opening.visible = false;
    group.add(opening);

    const rig: UnitDoorRig = { pivot, door, opening };
    group.userData.unitDoorRig = rig;
    delete group.userData.unitDoorPivot;
    delete group.userData.unitDoorOpenAngle;
    return rig;
  }

  /** Nudge the opening mesh slightly into the unit so it sits behind the door panel. */
  private insetOpeningTowardUnitInterior(
    opening: THREE.Mesh,
    doorPos: THREE.Vector3,
    size: THREE.Vector3,
  ): void {
    if (size.x <= size.z) {
      const sign = -(Math.sign(doorPos.x) || -1);
      opening.position.x += sign * OPENING_INSET;
    } else {
      const sign = -(Math.sign(doorPos.z) || -1);
      opening.position.z += sign * OPENING_INSET;
    }
  }

  /** Remove legacy hinge-pivot swing rigs from older simulator sessions. */
  private teardownLegacySwingPivot(group: THREE.Group): void {
    const legacy = group.userData.unitDoorPivot as THREE.Object3D | undefined;
    if (!legacy) return;

    legacy.rotation.set(0, 0, 0);
    legacy.updateMatrixWorld(true);

    const door = legacy.children.find(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.userData.partName === 'door',
    );
    if (door) {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      door.getWorldPosition(worldPos);
      door.getWorldQuaternion(worldQuat);
      door.getWorldScale(worldScale);
      legacy.remove(door);
      group.add(door);
      group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
      worldPos.applyMatrix4(inv);
      door.position.copy(worldPos);
      const parentQuat = new THREE.Quaternion();
      group.getWorldQuaternion(parentQuat);
      door.quaternion.copy(parentQuat.invert().multiply(worldQuat));
      door.scale.copy(worldScale);
    }

    group.remove(legacy);
    delete group.userData.unitDoorPivot;
    delete group.userData.unitDoorOpenAngle;
  }
}
