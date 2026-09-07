/**
 * Procedural Tron-inspired ground plane for the `techno` viewer preset.
 *
 * Pure shader — no texture downloads. Glowing cyan grid lines, intersection
 * blooms, traveling pulse waves, and optional radial horizon fade.
 */

import * as THREE from 'three';
import type { TechnoEnvironmentOptions } from './ScenePresets';

export const TECHNO_GRID_CELL_SIZE = 2.4;

const TECHNO_VERTEX_SHADER = /* glsl */ `
  out vec2 vWorldOffset;
  out vec3 vWorldPos;
  uniform float uPlaneSize;

  void main() {
    vWorldOffset = position.xz * uPlaneSize;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const TECHNO_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uCellSize;
  uniform float uMajorInterval;
  uniform float uSuperInterval;
  uniform vec2 uFacilityHalf;
  uniform vec2 uContentCenter;
  uniform float uFadeStart;
  uniform float uOuterFade;
  uniform vec3 uHorizonColor;
  uniform vec3 uVoidColor;
  uniform vec3 uLineColor;
  uniform vec3 uAccentColor;
  uniform float uPulseSpeed;
  uniform float uGlowIntensity;
  uniform float uLineThickness;
  uniform float uMajorLineThickness;
  uniform float uSuperLineThickness;
  uniform float uPlatformGlow;
  uniform float uBaseAlpha;
  uniform float uSpaceBackdrop;
  uniform float uWorldPerPixel;

  in vec2 vWorldOffset;
  in vec3 vWorldPos;

  out vec4 fragColor;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float gridLine(vec2 coord, float period, float thicknessPx) {
    vec2 r = coord / period;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / max(fwidth(r), 1e-4);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / thicknessPx, 1.0);
  }

  void main() {
    vec2 offset = vWorldOffset - uContentCenter;
    float radial = length(offset);
    float edgeFade = 1.0 - smoothstep(uFadeStart, uOuterFade, radial);
    edgeFade = clamp(edgeFade, 0.0, 1.0);
    if (edgeFade < 0.004) discard;

    vec2 coord = vWorldOffset;

    float minor = gridLine(coord, uCellSize, 1.05 * uLineThickness);
    float major = gridLine(coord, uCellSize * uMajorInterval, 1.35 * uMajorLineThickness);
    float superGrid = gridLine(coord, uCellSize * uSuperInterval, 1.8 * uSuperLineThickness);

    // Zoom-based tier fade — matches GridSystem: each level dissolves as its cells
    // shrink below ~14–30 screen pixels; major/super take over to keep density stable.
    float minorCellPx = uCellSize / max(uWorldPerPixel, 1e-6);
    float minorVis = smoothstep(14.0, 30.0, minorCellPx);
    float majorVis = smoothstep(14.0, 30.0, minorCellPx * uMajorInterval);
    float superVis = smoothstep(14.0, 30.0, minorCellPx * uSuperInterval);

    minor *= minorVis;
    major *= majorVis;
    superGrid *= superVis;

    float ixMinor = pow(minor, 0.55);
    float ixMajor = pow(major, 0.65);
    float intersections = max(ixMinor * major, ixMajor * superGrid);

    float pulseA = 0.5 + 0.5 * sin(uTime * uPulseSpeed - coord.x * 0.38 + coord.y * 0.12);
    float pulseB = 0.5 + 0.5 * sin(uTime * uPulseSpeed * 0.82 - coord.y * 0.31 + 1.7);
    float pulse = mix(pulseA, pulseB, 0.45);
    float pulseMask = minor * (0.35 + 0.65 * pulse);

    float shimmer = hash21(floor(coord * 0.7) + floor(uTime * 3.0)) * 0.04;

    float lineMask = max(max(minor * 0.55, major * 0.85), superGrid);
    lineMask = max(lineMask, intersections * 1.35);
    lineMask = max(lineMask, pulseMask * 0.9);
    lineMask += shimmer;

    vec2 inside = max(abs(offset) - uFacilityHalf, vec2(0.0));
    float platformDist = length(inside);
    float platformGlow = exp(-platformDist * 0.08) * uPlatformGlow;

    vec3 base = vec3(0.0);
    float fillAlpha = 0.0;
    if (uSpaceBackdrop < 0.5) {
      base = mix(uVoidColor, uHorizonColor * 0.15, edgeFade * 0.35);
      fillAlpha = uBaseAlpha;
    }

    vec3 lineCol = mix(uLineColor, uAccentColor, intersections);
    vec3 emissive = lineCol * lineMask * uGlowIntensity;
    emissive += uAccentColor * platformGlow * uGlowIntensity;

    vec3 color = base + emissive;
    float alpha = clamp((lineMask * 0.95 + platformGlow + fillAlpha) * edgeFade, 0.0, 1.0);

    fragColor = vec4(color, alpha);
  }
`;

export function applyTechnoGridUniforms(
  material: THREE.ShaderMaterial,
  techno: TechnoEnvironmentOptions
): void {
  const u = material.uniforms;
  u.uCellSize.value = techno.cellSize ?? TECHNO_GRID_CELL_SIZE;
  u.uMajorInterval.value = techno.majorInterval ?? 5;
  u.uSuperInterval.value = techno.superInterval ?? 25;
  u.uPulseSpeed.value = techno.pulseSpeed ?? 1.6;
  u.uGlowIntensity.value = techno.glowIntensity ?? 1.15;
  u.uLineThickness.value = techno.lineThickness ?? 1;
  u.uMajorLineThickness.value = techno.majorLineThickness ?? 1;
  u.uSuperLineThickness.value = techno.superLineThickness ?? 1;
  u.uPlatformGlow.value = techno.platformGlow ?? 0.12;
  u.uBaseAlpha.value = techno.baseAlpha ?? 0.06;
  u.uSpaceBackdrop.value = techno.showSpaceBackdrop ? 1 : 0;
  (u.uHorizonColor.value as THREE.Color).set(techno.horizonColor ?? '#0a1628');
  (u.uVoidColor.value as THREE.Color).set(techno.voidColor ?? '#050812');
  (u.uLineColor.value as THREE.Color).set(techno.lineColor ?? '#147fd4');
  (u.uAccentColor.value as THREE.Color).set(techno.accentColor ?? '#00e8ff');
}

export function createTechnoGridMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTime: { value: 0 },
      uCellSize: { value: TECHNO_GRID_CELL_SIZE },
      uMajorInterval: { value: 5 },
      uSuperInterval: { value: 25 },
      uPlaneSize: { value: 1 },
      uFacilityHalf: { value: new THREE.Vector2(1, 1) },
      uContentCenter: { value: new THREE.Vector2(0, 0) },
      uFadeStart: { value: 40 },
      uOuterFade: { value: 200 },
      uHorizonColor: { value: new THREE.Color('#0a1628') },
      uVoidColor: { value: new THREE.Color('#050812') },
      uLineColor: { value: new THREE.Color('#147fd4') },
      uAccentColor: { value: new THREE.Color('#00e8ff') },
      uPulseSpeed: { value: 1.6 },
      uGlowIntensity: { value: 1.15 },
      uLineThickness: { value: 1 },
      uMajorLineThickness: { value: 1 },
      uSuperLineThickness: { value: 1 },
      uPlatformGlow: { value: 0.12 },
      uBaseAlpha: { value: 0.06 },
      uSpaceBackdrop: { value: 0 },
      uWorldPerPixel: { value: 0.05 },
    },
    vertexShader: TECHNO_VERTEX_SHADER,
    fragmentShader: TECHNO_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: true,
  });
}
