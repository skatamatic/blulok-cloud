import * as THREE from 'three';
import { isValidTextureForSkinning } from '../../../../components/bludesign/core/skins/textureValidation';

describe('isValidTextureForSkinning', () => {
  it('returns false for null/undefined', () => {
    expect(isValidTextureForSkinning(null)).toBe(false);
    expect(isValidTextureForSkinning(undefined)).toBe(false);
  });

  it('returns true when matrix.elements exist', () => {
    const tex = new THREE.Texture();
    tex.matrix = new THREE.Matrix3();
    tex.matrix.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(isValidTextureForSkinning(tex)).toBe(true);
  });
});
