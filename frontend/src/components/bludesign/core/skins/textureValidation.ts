/**
 * Texture checks before assigning maps on skinned meshes (Three.js UV matrix).
 */

import * as THREE from 'three';

/**
 * Whether a texture can be used for map slots; may assign {@link THREE.Texture#matrix} if missing.
 */
export function isValidTextureForSkinning(
  texture: THREE.Texture | null | undefined
): texture is THREE.Texture {
  if (!texture) return false;
  if (!(texture instanceof THREE.Texture)) return false;
  if (!texture.matrix) {
    try {
      texture.matrix = new THREE.Matrix3();
      console.warn('[isValidTextureForSkinning] Fixed missing matrix on texture');
    } catch {
      return false;
    }
  }
  if (!texture.matrix.elements) return false;
  return true;
}
