import * as THREE from 'three';
import { AssetFactory } from '../../assets/AssetFactory';
import { getSkinRegistry } from '../SkinRegistry';
import type { CategorySkin } from '../SkinRegistry';
import { ORIGINAL_MATERIALS_SKIN_ID } from '../placement';
import { storeDefaultMaterials, resetToDefaultMaterials } from '../skins';
import {
  DeviceState,
  type EntityBinding,
  type PlacedObject,
  type SimulationState,
} from '../types';

export function updatePlacedObjectBinding(
  id: string,
  binding: EntityBinding | undefined,
  ctx: {
    getObject: (objectId: string) => THREE.Object3D | undefined;
    getObjectData: (objectId: string) => PlacedObject | undefined;
    applyVisualState?: (group: THREE.Group, placedObj: PlacedObject) => void;
    emitStateUpdated: () => void;
  }
): void {
  const obj = ctx.getObject(id);
  if (!obj) return;
  const placedObj = ctx.getObjectData(id);
  if (!placedObj) return;

  if (binding) {
    let entityType: 'unit' | 'device' | 'facility' = 'unit';
    if (
      binding.entityType === 'gate' ||
      binding.entityType === 'elevator' ||
      binding.entityType === 'door' ||
      binding.entityType === 'device'
    ) {
      entityType = 'device';
    } else if (binding.entityType === 'unit') {
      entityType = 'unit';
    }

    placedObj.binding = {
      entityType,
      entityId: binding.entityId,
      currentState: placedObj.binding?.currentState ?? DeviceState.UNKNOWN,
    };
  } else {
    placedObj.binding = undefined;
  }
  // Bound/unbound transitions change the themed-unit look (dim/transparent).
  ctx.applyVisualState?.(obj as THREE.Group, placedObj);
  ctx.emitStateUpdated();
}

export function updatePlacedObjectSkin(
  id: string,
  skinId: string | undefined,
  ctx: {
    getObject: (objectId: string) => THREE.Object3D | undefined;
    getObjectData: (objectId: string) => PlacedObject | undefined;
    getEnvironmentMap: () => THREE.Texture | null;
    applySkinToObject: (object: THREE.Object3D, skin: CategorySkin) => void;
    applyActiveThemeSkin: (
      object: THREE.Object3D,
      objectData?: PlacedObject
    ) => void;
    scheduleAutoSave: () => void;
    emitStateUpdated: () => void;
  }
): void {
  const obj = ctx.getObject(id);
  if (!obj) return;
  const placedObj = ctx.getObjectData(id);
  if (!placedObj) return;

  if (skinId) {
    placedObj.skinId = skinId;

    if (skinId === ORIGINAL_MATERIALS_SKIN_ID) {
      storeDefaultMaterials(obj as THREE.Group);
      resetToDefaultMaterials(obj as THREE.Group, {
        getEnvironmentMap: ctx.getEnvironmentMap,
      });
      console.log(`[updateObjectSkin] Restored original materials for object ${id}`);
    } else {
      storeDefaultMaterials(obj as THREE.Group);
      const skinRegistry = getSkinRegistry();
      const skin = skinRegistry.getSkin(skinId);
      if (skin) {
        console.log(`[updateObjectSkin] Applying skin "${skin.name}" to object ${id}`);
        ctx.applySkinToObject(obj, skin);
      } else {
        console.warn(`[updateObjectSkin] Skin "${skinId}" not found in registry`);
      }
    }
  } else {
    delete placedObj.skinId;
    resetToDefaultMaterials(obj as THREE.Group, {
      getEnvironmentMap: ctx.getEnvironmentMap,
    });
    ctx.applyActiveThemeSkin(obj, placedObj);
  }
  ctx.emitStateUpdated();
  ctx.scheduleAutoSave();
}

export function updatePlacedObjectSimulationState(
  id: string,
  simState: SimulationState,
  ctx: {
    getObject: (objectId: string) => THREE.Object3D | undefined;
    getObjectData: (objectId: string) => PlacedObject | undefined;
    applyVisualState: (group: THREE.Group, placedObj: PlacedObject) => void;
    emitStateUpdated: () => void;
  }
): void {
  const obj = ctx.getObject(id);
  if (!obj) return;
  const placedObj = ctx.getObjectData(id);
  if (!placedObj || !placedObj.assetMetadata?.isSmart) return;

  if (simState.isSimulating && simState.simulatedState) {
    if (!placedObj.properties._originalState && placedObj.binding) {
      placedObj.properties._originalState = placedObj.binding.currentState;
    }
    if (placedObj.binding) {
      placedObj.binding.currentState = simState.simulatedState;
    } else {
      placedObj.binding = {
        entityType: 'unit',
        currentState: simState.simulatedState,
      };
    }
    ctx.applyVisualState(obj as THREE.Group, placedObj);
  } else {
    if (placedObj.properties._originalState && placedObj.binding) {
      placedObj.binding.currentState = placedObj.properties._originalState as DeviceState;
      delete placedObj.properties._originalState;
      ctx.applyVisualState(obj as THREE.Group, placedObj);
    }
  }
  ctx.emitStateUpdated();
}

export function updatePlacedObjectAssetVisualState(
  group: THREE.Group,
  state: DeviceState
): void {
  AssetFactory.updateAssetState(group, state);
}
