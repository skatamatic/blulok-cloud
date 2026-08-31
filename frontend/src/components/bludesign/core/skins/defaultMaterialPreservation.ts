import * as THREE from 'three';

/**
 * Store default material properties before applying a skin.
 * Stores materials for ALL meshes (not just those with partName) to support imported GLBs.
 * We store CLONES of materials on the MESH (not the material) since materials get replaced by skins.
 */
export function storeDefaultMaterials(object: THREE.Object3D): void {
  const group = object as THREE.Group;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.userData.originalMaterialsStored) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const clonedMaterials: THREE.Material[] = [];

      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i] as THREE.MeshStandardMaterial;
        if (mat) {
          try {
            const clonedMat = mat.clone();
            clonedMaterials.push(clonedMat);
            console.log(
              `[storeDefaultMaterials] Stored clone on mesh: color=${clonedMat.color?.getHexString()}, metalness=${clonedMat.metalness}, roughness=${clonedMat.roughness}`
            );
          } catch (e) {
            console.warn('[storeDefaultMaterials] Failed to clone material:', e);
            clonedMaterials.push(mat);
          }
        }
      }

      child.userData.originalMaterialClones = clonedMaterials;
      child.userData.originalMaterialsStored = true;

      if (child.userData.partName && !child.userData.defaultMaterial) {
        const mat = materials[0] as THREE.MeshStandardMaterial;
        if (mat) {
          child.userData.defaultMaterial = {
            color: mat.color ? '#' + mat.color.getHexString() : '#ffffff',
            metalness: mat.metalness ?? 0,
            roughness: mat.roughness ?? 1,
            emissive: mat.emissive ? '#' + mat.emissive.getHexString() : '#000000',
            emissiveIntensity: mat.emissiveIntensity ?? 0,
            transparent: mat.transparent ?? false,
            opacity: mat.opacity ?? 1,
          };
        }
      }
    }
  });
}

export interface ResetToDefaultMaterialsDeps {
  getEnvironmentMap(): THREE.Texture | null | undefined;
}

/**
 * Reset mesh materials to their stored defaults.
 * Uses the cloned original materials stored on the MESH (not material userData).
 */
export function resetToDefaultMaterials(group: THREE.Group, deps: ResetToDefaultMaterialsDeps): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const originalClones = child.userData.originalMaterialClones as THREE.MeshStandardMaterial[] | undefined;
      if (originalClones && originalClones.length > 0) {
        const isArray = Array.isArray(child.material);
        const newMaterials: THREE.Material[] = [];

        for (let i = 0; i < originalClones.length; i++) {
          const originalClone = originalClones[i];
          if (!originalClone) continue;

          try {
            console.log(
              `[resetToDefaultMaterials] Restoring from mesh-stored clone: color=${originalClone.color?.getHexString()}, metalness=${originalClone.metalness}, roughness=${originalClone.roughness}`
            );
            const freshClone = originalClone.clone();
            if (!freshClone.envMap) {
              const sceneEnvMap = deps.getEnvironmentMap();
              if (sceneEnvMap) {
                freshClone.envMap = sceneEnvMap;
                console.log(`[resetToDefaultMaterials] Applied scene environment map`);
              }
            }
            freshClone.needsUpdate = true;
            console.log(
              `[resetToDefaultMaterials] Fresh clone ready: color=${freshClone.color?.getHexString()}, metalness=${freshClone.metalness}`
            );
            newMaterials.push(freshClone);
          } catch (e) {
            console.warn('[resetToDefaultMaterials] Failed to clone original material:', e);
            newMaterials.push(originalClone);
          }
        }

        if (newMaterials.length > 0) {
          if (isArray) {
            child.material = newMaterials;
          } else {
            child.material = newMaterials[0];
          }
        }
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

        const originalMaterial = mat.userData.originalMaterial;
        if (originalMaterial && originalMaterial.color) {
          try {
            mat.color.setStyle(originalMaterial.color);
            mat.metalness = originalMaterial.metalness ?? 0;
            mat.roughness = originalMaterial.roughness ?? 1;
            if (originalMaterial.emissive && mat.emissive) {
              mat.emissive.setStyle(originalMaterial.emissive);
            }
            mat.emissiveIntensity = originalMaterial.emissiveIntensity ?? 0;
            mat.transparent = originalMaterial.transparent ?? false;
            mat.opacity = originalMaterial.opacity ?? 1;
            mat.envMapIntensity = originalMaterial.envMapIntensity ?? 1;
            if (!mat.envMap) {
              const sceneEnvMap = deps.getEnvironmentMap();
              if (sceneEnvMap) mat.envMap = sceneEnvMap;
            }
            mat.needsUpdate = true;
            continue;
          } catch (e) {
            console.warn('[resetToDefaultMaterials] Error restoring material properties:', e);
          }
        }

        if (child.userData.defaultMaterial) {
          const defaults = child.userData.defaultMaterial;
          try {
            if (defaults.color) mat.color.setStyle(defaults.color);
            mat.metalness = defaults.metalness ?? 0;
            mat.roughness = defaults.roughness ?? 1;
            if (defaults.emissive && mat.emissive) {
              mat.emissive.setStyle(defaults.emissive);
            }
            mat.emissiveIntensity = defaults.emissiveIntensity ?? 0;
            mat.transparent = defaults.transparent ?? false;
            mat.opacity = defaults.opacity ?? 1;
            if (!mat.envMap) {
              const sceneEnvMap = deps.getEnvironmentMap();
              if (sceneEnvMap) mat.envMap = sceneEnvMap;
            }
            mat.needsUpdate = true;
          } catch (e) {
            console.warn('[resetToDefaultMaterials] Error restoring default material:', e);
          }
        }
      }
    }
  });
}
