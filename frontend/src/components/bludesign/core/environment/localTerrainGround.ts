/**
 * Displaced satellite terrain ground for the `local` viewer preset.
 */

import * as THREE from 'three';
import type { LocalEnvironmentOptions } from './ScenePresets';
import type { TerrainConfig } from './terrainConfigMetadata';

export const LOCAL_TERRAIN_SEGMENTS = 256;

const LOCAL_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  uniform sampler2D uHeightmap;
  uniform float uHeightMin;
  uniform float uHeightMax;
  uniform float uElevationAmplitude;
  uniform vec2 uMeshSize;
  uniform float uFlattenEnabled;
  uniform sampler2D uFlattenMap;
  uniform vec2 uFlattenMapOrigin;
  uniform vec2 uFlattenMapSpan;
  uniform float uFlattenBaselineY;

  out vec2 vUv;
  out vec3 vWorldPos;
  out float vHeight;

  void main() {
    vUv = uv;
    // RG8 heightmap: texture() returns normalized [0,1], so scale back to raw bytes.
    vec2 rg = textureLod(uHeightmap, uv, 0.0).rg;
    float high = rg.r * 255.0;
    float low = rg.g * 255.0;
    float gray = (high * 256.0 + low) / 65535.0;
    // Heightmap encodes absolute meters; displace relative to site min so mesh sits on y≈0.
    float reliefM = (uHeightMax - uHeightMin) * gray;
    vHeight = reliefM * uElevationAmplitude;

    vec3 pos = position;
    pos.x *= uMeshSize.x;
    pos.z *= uMeshSize.y;

    if (uFlattenEnabled > 0.5) {
      vec4 worldFlat = modelMatrix * vec4(pos.x, 0.0, pos.z, 1.0);
      vec2 mapUv = (worldFlat.xz - uFlattenMapOrigin) / uFlattenMapSpan;
      if (mapUv.x >= 0.0 && mapUv.x <= 1.0 && mapUv.y >= 0.0 && mapUv.y <= 1.0) {
        float flatten = texture(uFlattenMap, mapUv).r;
        vHeight = mix(vHeight, uFlattenBaselineY, flatten);
      }
    }

    pos.y += vHeight;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const LOCAL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uImagery;
  uniform vec2 uFacilityHalf;
  uniform vec2 uContentCenter;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uAssetDim;
  uniform float uShowWireframe;
  uniform float uWireframeAmount;
  uniform float uWireframeBlend;
  uniform float uBrightness;
  uniform float uSaturation;
  uniform float uBaseOpacity;
  uniform vec3 uLineColor;
  uniform float uCellSize;

  in vec2 vUv;
  in vec3 vWorldPos;
  in float vHeight;

  out vec4 fragColor;

  float gridLine(vec2 coord, float period) {
    vec2 r = coord / period;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / max(fwidth(r), 1e-4);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / 1.2, 1.0);
  }

  vec3 applySaturation(vec3 color, float sat) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), color, sat);
  }

  void main() {
    vec2 offset = vWorldPos.xz - uContentCenter;
    float radial = length(offset);
    float edgeFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, radial);
    edgeFade = clamp(edgeFade, 0.0, 1.0);
    if (edgeFade < 0.004) discard;

    vec3 imagery = texture(uImagery, vUv).rgb;
    imagery *= uBrightness;
    imagery = applySaturation(imagery, uSaturation);

    vec2 inside = max(abs(offset) - uFacilityHalf, vec2(0.0));
    float platformDist = length(inside);
    float dimMask = smoothstep(0.0, max(uFacilityHalf.x, uFacilityHalf.y) * 0.35, platformDist);
    imagery *= mix(1.0, 1.0 - uAssetDim, dimMask);

    vec3 color = imagery;

    if (uShowWireframe > 0.5) {
      float outerStart = uFadeEnd * uWireframeAmount;
      float wireT = smoothstep(outerStart, outerStart + uFadeEnd * uWireframeBlend, radial);
      if (wireT > 0.001) {
        float minor = gridLine(vWorldPos.xz, uCellSize);
        float major = gridLine(vWorldPos.xz, uCellSize * 5.0);
        float lineMask = max(minor * 0.6, major * 0.9);
        vec3 wire = uLineColor * lineMask;
        color = mix(color, wire, wireT * 0.85);
      }
    }

    float alpha = uBaseOpacity * edgeFade;
    fragColor = vec4(color, alpha);
  }
`;

export function createLocalTerrainMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uImagery: { value: null as THREE.Texture | null },
      uHeightmap: { value: null as THREE.Texture | null },
      uHeightMin: { value: 0 },
      uHeightMax: { value: 100 },
      uElevationAmplitude: { value: 1 },
      uMeshSize: { value: new THREE.Vector2(400, 400) },
      uFlattenEnabled: { value: 0 },
      uFlattenMap: { value: null as THREE.Texture | null },
      uFlattenMapOrigin: { value: new THREE.Vector2(0, 0) },
      uFlattenMapSpan: { value: new THREE.Vector2(1, 1) },
      uFlattenBaselineY: { value: 0 },
      uFacilityHalf: { value: new THREE.Vector2(10, 10) },
      uContentCenter: { value: new THREE.Vector2(0, 0) },
      uFadeStart: { value: 50 },
      uFadeEnd: { value: 200 },
      uAssetDim: { value: 0.35 },
      uShowWireframe: { value: 1 },
      uWireframeAmount: { value: 0.65 },
      uWireframeBlend: { value: 0.2 },
      uBrightness: { value: 1 },
      uSaturation: { value: 1 },
      uBaseOpacity: { value: 1 },
      uLineColor: { value: new THREE.Color('#147fd4') },
      uCellSize: { value: 4 },
    },
    vertexShader: LOCAL_VERTEX_SHADER,
    fragmentShader: LOCAL_FRAGMENT_SHADER,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

/** Radial fade distances from facility bbox center (meters). */
export function computeLocalTerrainFadeRadii(params: {
  maxHalf: number;
  maxDim: number;
  terrainRadius: number;
  fadeStartScale: number;
  fadeEndScale: number;
}): { fadeStart: number; fadeEnd: number } {
  const { maxHalf, maxDim, terrainRadius, fadeStartScale, fadeEndScale } = params;
  const autoFadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.35, 10, 55);
  const autoFadeEnd = autoFadeStart + THREE.MathUtils.clamp(maxDim * 2.2, 150, 1100);

  const fadeStart = Math.max(0, autoFadeStart * fadeStartScale);
  const fadeEnd = Math.max(fadeStart + 0.25, autoFadeEnd * fadeEndScale);

  const maxFade = terrainRadius * 1.02;
  return {
    fadeStart: Math.min(fadeStart, maxFade * 0.98),
    fadeEnd: Math.min(fadeEnd, maxFade),
  };
}

export function applyLocalTerrainUniforms(
  material: THREE.ShaderMaterial,
  local: LocalEnvironmentOptions,
  config: TerrainConfig
): void {
  const u = material.uniforms;
  const elevationScale = local.elevationAmplitudeScale ?? 1;
  u.uElevationAmplitude.value = config.elevationAmplitude * elevationScale;
  u.uHeightMin.value = config.heightMinM;
  u.uHeightMax.value = config.heightMaxM;
  u.uBaseOpacity.value = config.baseOpacity;
  u.uAssetDim.value = local.assetDim ?? 0.35;
  u.uShowWireframe.value = local.showWireframeOutskirts ? 1 : 0;
  u.uWireframeAmount.value = local.wireframeAmount ?? 0.65;
  u.uWireframeBlend.value = local.wireframeBlend ?? 0.2;
  u.uBrightness.value = local.brightness ?? 1;
  u.uSaturation.value = local.saturation ?? 1;
}

export function applyLocalTerrainTransform(
  mesh: THREE.Mesh,
  config: TerrainConfig,
  center: THREE.Vector3
): void {
  const worldSize = config.worldSizeMeters;
  mesh.position.set(
    center.x + config.offset.x,
    -0.005 + config.offset.y,
    center.z + config.offset.z
  );
  mesh.rotation.set(0, (config.rotationDeg * Math.PI) / 180, 0);
  const aspectX = config.meshWidth > 0 ? config.meshWidth / Math.max(config.meshHeight, 1) : 1;
  mesh.scale.set(worldSize * config.scale * aspectX, 1, worldSize * config.scale);

  const u = (mesh.material as THREE.ShaderMaterial).uniforms;
  u.uMeshSize.value.set(1, 1);
}
