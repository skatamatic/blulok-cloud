/**
 * Drives runtime state-based visuals for storage units, with a small reusable
 * per-frame animation system for the time-based effects (flashing + door swing).
 *
 * Behaviour only kicks in for units wearing the built-in "White & Blue Steel"
 * theme ({@link THEMED_UNIT_SKIN_ID}); every other asset falls back to the
 * legacy flat-colour {@link AssetFactory.updateAssetState} swap so existing
 * behaviour is untouched.
 *
 * Themed unit appearance, driven by binding + {@link DeviceState}:
 *  - not bound      → slightly dimmer + 80% transparent
 *  - locked (bound) → the plain themed look
 *  - unlocked       → door swings open and reads black (the dark opening)
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

interface UnitVisualEntry {
  group: THREE.Group;
  /** Materials that pulse while flashing (null colour ⇒ no flash). */
  flashColor: THREE.Color | null;
  flashMaterials: THREE.MeshStandardMaterial[];
  doorPivot: THREE.Object3D | null;
  doorTargetAngle: number;
}

const FLASH_RED = 0xff2a2a;
const FLASH_YELLOW = 0xffc400;
const FLASH_SPEED = 5.2; // rad/s ≈ 0.8 Hz
const FLASH_MIN = 0.06;
const FLASH_MAX = 0.95;

const DOOR_OPEN_ANGLE = Math.PI * 0.6; // ~108°
const DOOR_DAMP = 9; // higher = snappier swing
const DOOR_BLACK = 0x0a0a0a;

const UNBOUND_OPACITY = 0.66; // 90% opacity — subtly translucent, not ghostly
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

  /** Per-frame tick: advances flashing emissive and door-swing animation. */
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

      if (entry.doorPivot) {
        const current = entry.doorPivot.rotation.y;
        if (Math.abs(current - entry.doorTargetAngle) > 1e-3) {
          entry.doorPivot.rotation.y = THREE.MathUtils.damp(
            current,
            entry.doorTargetAngle,
            DOOR_DAMP,
            delta
          );
        } else {
          entry.doorPivot.rotation.y = entry.doorTargetAngle;
        }
      }
    }
  }

  dispose(): void {
    this.entries.clear();
  }

  // ----------------------------------------------------------------------------

  private applyThemedState(group: THREE.Group, bound: boolean, state: DeviceState): void {
    const doorPivot = this.ensureDoorPivot(group);
    const bodyRoofMats = this.collectMaterials(group, ['body', 'roof']);
    const doorMats = this.collectMaterials(group, ['door']);
    const allMats = [...bodyRoofMats, ...doorMats];

    // Always start from the pristine themed look, then layer the state on top.
    for (const mat of allMats) this.resetToBase(mat);

    let flashColor: THREE.Color | null = null;
    let doorTargetAngle = 0;

    if (!bound) {
      // No live data → ghostly, dim and mostly transparent.
      for (const mat of allMats) this.applyDim(mat);
    } else {
      switch (state) {
        case DeviceState.UNLOCKED:
          doorTargetAngle = group.userData.unitDoorOpenAngle ?? DOOR_OPEN_ANGLE;
          for (const mat of doorMats) this.applyOpenDoor(mat);
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

    this.entries.set(group.uuid, {
      group,
      flashColor,
      flashMaterials,
      doorPivot: doorPivot ?? null,
      doorTargetAngle,
    });
  }

  /** Restore base materials and close the door; optionally keep the entry gone. */
  private releaseGroup(group: THREE.Group, keepPivotClosed: boolean): void {
    const entry = this.entries.get(group.uuid);
    if (!entry && !keepPivotClosed) return;

    const mats = this.collectMaterials(group, ['body', 'roof', 'door']);
    for (const mat of mats) {
      if (this.materialBases.has(mat)) this.resetToBase(mat);
    }
    const pivot = group.userData.unitDoorPivot as THREE.Object3D | undefined;
    if (pivot) pivot.rotation.y = 0;
    this.entries.delete(group.uuid);
  }

  private collectMaterials(
    group: THREE.Group,
    partNames: string[]
  ): THREE.MeshStandardMaterial[] {
    const result: THREE.MeshStandardMaterial[] = [];
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
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

  private applyOpenDoor(mat: THREE.MeshStandardMaterial): void {
    mat.color.setHex(DOOR_BLACK);
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.metalness = 0.1;
    mat.roughness = 0.95;
    mat.needsUpdate = true;
  }

  /**
   * Wraps a unit's door mesh in a hinge pivot so it can swing open. Idempotent —
   * the pivot + open angle are cached on the group's userData. Hinge edge and
   * swing direction are derived from the door geometry so it works for both the
   * standard front door and custom doors on any side.
   */
  private ensureDoorPivot(group: THREE.Group): THREE.Object3D | undefined {
    const existing = group.userData.unitDoorPivot as THREE.Object3D | undefined;
    if (existing) return existing;

    let door: THREE.Mesh | undefined;
    group.traverse((child) => {
      if (!door && child instanceof THREE.Mesh && child.userData.partName === 'door') {
        door = child;
      }
    });
    if (!door || door.parent !== group) return undefined;

    door.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    door.geometry.boundingBox!.getSize(size);

    const pos = door.position.clone();
    const pivot = new THREE.Group();
    pivot.name = 'UnitDoorPivot';

    let openAngle: number;
    if (size.x <= size.z) {
      // Thin along X ⇒ door faces ±X; hinge runs along Z.
      const doorWidth = size.z;
      pivot.position.set(pos.x, pos.y, pos.z - doorWidth / 2);
      door.position.set(0, 0, doorWidth / 2);
      openAngle = (Math.sign(pos.x) || 1) * DOOR_OPEN_ANGLE;
    } else {
      // Thin along Z ⇒ door faces ±Z; hinge runs along X.
      const doorWidth = size.x;
      pivot.position.set(pos.x - doorWidth / 2, pos.y, pos.z);
      door.position.set(doorWidth / 2, 0, 0);
      openAngle = -(Math.sign(pos.z) || 1) * DOOR_OPEN_ANGLE;
    }

    group.remove(door);
    pivot.add(door);
    group.add(pivot);

    group.userData.unitDoorPivot = pivot;
    group.userData.unitDoorOpenAngle = openAngle;
    return pivot;
  }
}
