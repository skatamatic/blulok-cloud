import { createTechnoGridMaterial } from '@/components/bludesign/core/environment/technoGridGround';
import * as THREE from 'three';

describe('technoGridGround', () => {
  it('uses GLSL3 varyings and fragment output (not legacy varying/gl_FragColor)', () => {
    const material = createTechnoGridMaterial();
    expect(material.glslVersion).toBe(THREE.GLSL3);
    expect(material.vertexShader).toContain('out vec2 vWorldOffset');
    expect(material.fragmentShader).toContain('in vec2 vWorldOffset');
    expect(material.fragmentShader).toContain('out vec4 fragColor');
    expect(material.fragmentShader).toContain('uWorldPerPixel');
    expect(material.fragmentShader).toContain('minorVis');
    expect(material.fragmentShader).not.toMatch(/\bvarying\b/);
    expect(material.fragmentShader).not.toContain('gl_FragColor');
  });
});
