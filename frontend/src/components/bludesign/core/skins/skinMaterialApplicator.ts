/**
 * Applies a {@link CategorySkin} to a loaded asset group (mesh traverse, material clone, maps).
 */

import * as THREE from 'three';
import type { CategorySkin } from '../SkinRegistry';
import { isValidTextureForSkinning } from './textureValidation';

export interface SkinTextureLoaderPort {
  loadTexture(url: string): THREE.Texture;
  /** Defaults to {@link isValidTextureForSkinning} when omitted */
  isValidTexture?: (texture: THREE.Texture | null | undefined) => texture is THREE.Texture;
}

/**
 * Mutates mesh materials under `group` to match `skin` part materials.
 */
export function applyCategorySkinToObjectGroup(
  group: THREE.Group,
  skin: CategorySkin,
  textures: SkinTextureLoaderPort
): void {
  const isValid = textures.isValidTexture ?? isValidTextureForSkinning;

  const skinPartKeys = Object.keys(skin.partMaterials);
  const defaultMaterial =
    skin.partMaterials['body'] ||
    skin.partMaterials['surface'] ||
    Object.values(skin.partMaterials)[0];

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const partName = child.userData.partName as string;

      let mat = child.material as THREE.MeshStandardMaterial;

      if (Array.isArray(child.material)) {
        mat = child.material[0] as THREE.MeshStandardMaterial;
      }

      if (!mat) {
        return;
      }

      const isEmissive =
        mat.emissive &&
        mat.emissiveIntensity > 0.3 &&
        (mat.emissive.r > 0.1 || mat.emissive.g > 0.1 || mat.emissive.b > 0.1);
      if (isEmissive) {
        return;
      }

      let skinMaterial = partName ? skin.partMaterials[partName] : null;

      if (!skinMaterial && partName) {
        for (const key of skinPartKeys) {
          if (key.includes(partName) || partName.includes(key)) {
            skinMaterial = skin.partMaterials[key];
            break;
          }
        }
      }

      if (!skinMaterial) {
        skinMaterial = defaultMaterial;
      }

      if (skinMaterial) {
        if (!mat.userData.isClonedForSkin) {
          const clonedMat = mat.clone();
          clonedMat.userData.isClonedForSkin = true;
          child.material = clonedMat;
          mat = clonedMat;
        }

        mat.color.setStyle(skinMaterial.color);
        if (skinMaterial.metalness !== undefined) mat.metalness = skinMaterial.metalness;
        if (skinMaterial.roughness !== undefined) mat.roughness = skinMaterial.roughness;

        if (skinMaterial.textureUrl) {
          const texture = textures.loadTexture(skinMaterial.textureUrl);
          mat.map = isValid(texture) ? texture : null;
        } else {
          mat.map = null;
        }

        if (skinMaterial.normalMapUrl) {
          const normalMap = textures.loadTexture(skinMaterial.normalMapUrl);
          mat.normalMap = isValid(normalMap) ? normalMap : null;
        } else {
          mat.normalMap = null;
        }

        if (skinMaterial.roughnessMapUrl) {
          const roughnessMap = textures.loadTexture(skinMaterial.roughnessMapUrl);
          mat.roughnessMap = isValid(roughnessMap) ? roughnessMap : null;
        } else {
          mat.roughnessMap = null;
        }

        if (skinMaterial.shader === 'wireframe') {
          mat.wireframe = true;
        } else {
          mat.wireframe = false;
        }

        if (skinMaterial.transparent) {
          const baseOpacity = skinMaterial.opacity ?? 0.5;
          mat.transparent = true;
          mat.opacity = baseOpacity;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
          mat.userData.baseOpacity = baseOpacity;
          mat.userData.isNaturallyTransparent = true;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
          mat.userData.baseOpacity = 1.0;
          mat.userData.isNaturallyTransparent = false;
        }

        mat.needsUpdate = true;
      }
    }
  });
}
