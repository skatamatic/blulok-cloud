/**
 * Textured ground for the viewer's grass / concrete / natural presets.
 *
 * Keeps the implementation simple: crisp texture sampling, modest normal lighting,
 * radial fade to the horizon at the outer edge only. Avoids heavy haze / multi-scale
 * bias that washed out detail and caused banding.
 */

import * as THREE from 'three';
import {
  GROUND_PRESET_ASSETS,
  GroundPresetId,
  THEME_BACKGROUND_COLORS,
  resolveEnvironmentOptions,
  type ScenePresetApplyOptions,
  type TechnoEnvironmentOptions,
} from './ScenePresets';
import {
  hillSeedVec2,
  woodlandHillClearingHalf,
  WOODLAND_HILL_AMPLITUDE,
  WOODLAND_HILL_NOISE_SCALE,
} from './woodlandTerrain';
import {
  computeWoodlandWaterLayout,
  waterOptionsFrom,
  WOODLAND_MAX_PONDS,
  WOODLAND_MAX_RIVERS,
  WOODLAND_RIVER_POINT_COUNT,
  type WoodlandWaterLayout,
} from './woodlandWater';
import { createTechnoGridMaterial, applyTechnoGridUniforms } from './technoGridGround';

const WOODLAND_RIVER_UNIFORM_COUNT = WOODLAND_MAX_RIVERS * WOODLAND_RIVER_POINT_COUNT;

const TILE_WORLD_SIZE: Record<'grass' | 'concrete' | 'natural' | 'woodland' | 'urban', number> = {
  grass: 1.8,
  concrete: 5.5,
  natural: 1.9,
  woodland: 1.9,
  urban: 4.8,
};

/** Modest bias — enough for mid-distance detail without shimmer. */
const DIFFUSE_MIP_BIAS = -0.45;
const DETAIL_MIP_BIAS = -0.6;

const TEXTURE_TINTS = {
  grass: { color: '#a4dc6a', mix: 0.14, brightness: 1.2, saturation: 1.28 },
  concrete: { color: '#c4c8ce', mix: 0.2, brightness: 1.05, saturation: 1.02 },
  woodlandGrass: { color: '#86bd52', mix: 0.34, brightness: 1.42, saturation: 1.3 },
  woodlandConcrete: { color: '#b9bdc1', mix: 0.18, brightness: 1.02, saturation: 1.0 },
  urbanConcrete: { color: '#9ca3ad', mix: 0.3, brightness: 0.92, saturation: 0.82 },
} as const;

type TextureTint = (typeof TEXTURE_TINTS)[keyof typeof TEXTURE_TINTS];

const HORIZON_COLOR = '#c5d8e6';

/** Concrete pad extends this fraction of facility width/depth beyond each edge (natural preset). */
const PAD_EDGE_MARGIN_RATIO = 0.1;

const SUN_DIRECTION = new THREE.Vector3(0.38, 0.9, 0.2).normalize();

const FADE_VERTEX_SHADER = /* glsl */ `
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

const HILLS_VERTEX_SHADER = /* glsl */ `
  out vec2 vWorldOffset;
  out vec3 vWorldPos;
  uniform float uPlaneSize;
  uniform vec2 uFacilityHalf;
  uniform vec2 uHillFlatHalf;
  uniform vec2 uHillSeed;
  uniform float uHillAmplitude;
  uniform float uHillNoiseScale;

  uniform float uWaterEnabled;
  uniform float uWaterLevelY;
  uniform float uWaterBedDepth;
  uniform float uWaterBankWidth;
  uniform float uWaterUnderSlope;
  uniform float uRiverCount;
  uniform vec2 uRiverPoints[${WOODLAND_RIVER_UNIFORM_COUNT}];
  uniform float uRiverHalfWidths[${WOODLAND_RIVER_UNIFORM_COUNT}];
  uniform float uPondCount;
  uniform vec2 uPondCenters[${WOODLAND_MAX_PONDS}];
  uniform vec2 uPondRadiiArr[${WOODLAND_MAX_PONDS}];

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  // Signed distance to a variable-width segment (negative inside the channel).
  float segSignedDist(vec2 p, vec2 a, vec2 b, float wa, float wb) {
    vec2 ab = b - a;
    vec2 ap = p - a;
    float l = dot(ab, ab);
    float t = l > 0.0 ? clamp(dot(ap, ab) / l, 0.0, 1.0) : 0.0;
    float d = length(p - (a + ab * t));
    return d - mix(wa, wb, t);
  }

  // Signed distance to the nearest water surface (negative inside). Mirrors
  // woodlandWater.ts so the carved bed matches tree placement exactly.
  float waterSignedDistance(vec2 wo) {
    float best = 1e9;
    for (int r = 0; r < ${WOODLAND_MAX_RIVERS}; r++) {
      if (float(r) >= uRiverCount) break;
      int base = r * ${WOODLAND_RIVER_POINT_COUNT};
      for (int s = 0; s < ${WOODLAND_RIVER_POINT_COUNT - 1}; s++) {
        int i = base + s;
        best = min(best, segSignedDist(wo, uRiverPoints[i], uRiverPoints[i + 1], uRiverHalfWidths[i], uRiverHalfWidths[i + 1]));
      }
    }
    for (int p = 0; p < ${WOODLAND_MAX_PONDS}; p++) {
      if (float(p) >= uPondCount) break;
      vec2 n = (wo - uPondCenters[p]) / uPondRadiiArr[p];
      float r = length(n);
      best = min(best, (r - 1.0) * min(uPondRadiiArr[p].x, uPondRadiiArr[p].y));
    }
    return best;
  }

  float carveWater(float natural, vec2 wo) {
    if (uWaterEnabled < 0.5) return natural;
    float d = waterSignedDistance(wo);
    if (d >= uWaterBankWidth) return natural;
    if (d <= 0.0) {
      float depth = min(uWaterBedDepth, -d * uWaterUnderSlope);
      return uWaterLevelY - depth;
    }
    float t = uWaterBankWidth > 0.0 ? d / uWaterBankWidth : 1.0;
    float s = t * t * (3.0 - 2.0 * t);
    return uWaterLevelY + (natural - uWaterLevelY) * s;
  }

  float terrainHeight(vec2 worldOffset) {
    vec2 outsideRect = max(abs(worldOffset) - uHillFlatHalf, vec2(0.0));
    float edgeDist = max(outsideRect.x, outsideRect.y);
    float natural = 0.0;
    if (edgeDist > 0.0) {
      float transition = max(uHillFlatHalf.x, uHillFlatHalf.y) * 0.22;
      float hillMask = smoothstep(0.0, transition, edgeDist);
      vec2 samplePos = worldOffset * uHillNoiseScale + uHillSeed;
      float detail = fbm(samplePos);
      float broad = fbm(samplePos * 0.42 + vec2(11.7, 6.3));
      float combined = detail * 0.42 + broad * 0.58;
      float shaped = clamp((combined - 0.5) * 2.2, -1.0, 1.0);
      natural = shaped * uHillAmplitude * hillMask;
    }
    return carveWater(natural, worldOffset);
  }

  void main() {
    vWorldOffset = position.xz * uPlaneSize;
    vec3 pos = position;
    pos.y += terrainHeight(vWorldOffset);
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FADE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrimaryMap;
  uniform sampler2D uSecondaryMap;
  uniform sampler2D uPrimaryNormal;
  uniform sampler2D uSecondaryNormal;
  uniform float uHasSecondary;
  uniform float uHasNormals;
  uniform vec3 uPrimaryTint;
  uniform float uPrimaryTintMix;
  uniform vec3 uSecondaryTint;
  uniform float uSecondaryTintMix;
  uniform float uPrimaryBrightness;
  uniform float uSecondaryBrightness;
  uniform float uPrimarySaturation;
  uniform float uSecondarySaturation;
  uniform vec3 uSunDirection;
  uniform vec3 uHorizonColor;
  uniform float uHorizonBlend;
  uniform vec2 uFacilityHalf;
  uniform float uEdgeBlendWidth;
  uniform float uFadeStart;
  uniform float uOuterFade;
  uniform float uTileSize;
  uniform float uDiffuseBias;
  uniform float uDetailBias;
  uniform float uWoodlandMode;
  uniform float uUrbanMode;

  in vec2 vWorldOffset;
  in vec3 vWorldPos;

  out vec4 fragColor;

  vec3 recolor(vec3 c, vec3 tint, float amount) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 tinted = tint * (0.45 + lum * 0.85);
    return mix(c, tinted, amount);
  }

  vec3 saturateColor(vec3 c, float amount) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(vec3(l), c, amount);
  }

  vec3 sampleAlbedo(sampler2D map, vec2 uv) {
    vec3 base = texture(map, uv, uDiffuseBias).rgb;
    vec3 detail = texture(map, uv * 2.0, uDetailBias).rgb;
    return mix(base, detail, 0.2);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  vec3 sampleLayer(
    sampler2D map,
    sampler2D normalMap,
    vec2 uv,
    vec3 tint,
    float tintMix,
    float brightness,
    float saturation
  ) {
    vec3 albedo = recolor(sampleAlbedo(map, uv), tint, tintMix);
    albedo = saturateColor(albedo, saturation) * brightness;

    if (uHasNormals > 0.5) {
      vec3 n = texture(normalMap, uv, uDiffuseBias).rgb * 2.0 - 1.0;
      vec3 worldNormal = normalize(vec3(n.x * 0.9, max(n.y, 0.4), n.z * 0.9));
      float ndl = max(dot(worldNormal, uSunDirection), 0.0);
      float wrap = max(dot(worldNormal, uSunDirection) * 0.5 + 0.5, 0.0);
      albedo *= 0.62 + ndl * 0.38 + wrap * 0.1;
    } else {
      albedo *= 0.88;
    }

    return albedo;
  }

  void main() {
    vec2 uv = vWorldOffset / uTileSize;

    vec2 outsideRect = max(abs(vWorldOffset) - uFacilityHalf, vec2(0.0));
    // Chebyshev distance keeps a uniform curb-width band on every edge (not a corner diagonal).
    float edgeDist = max(outsideRect.x, outsideRect.y);

    // Radial fade — only the outer band; center stays sharp and opaque.
    float radial = length(vWorldOffset);
    float edgeFade = 1.0 - smoothstep(uFadeStart, uOuterFade, radial);
    edgeFade = clamp(edgeFade, 0.0, 1.0);
    if (edgeFade < 0.003) discard;

    vec3 primary = sampleLayer(
      uPrimaryMap, uPrimaryNormal, uv,
      uPrimaryTint, uPrimaryTintMix, uPrimaryBrightness, uPrimarySaturation
    );
    vec3 color = primary;

    if (uHasSecondary > 0.5) {
      vec3 secondary = sampleLayer(
        uSecondaryMap, uSecondaryNormal, uv,
        uSecondaryTint, uSecondaryTintMix, uSecondaryBrightness, uSecondarySaturation
      );
      // Narrow curb strip — pavement ends, grass begins (not a wide color wash).
      float toSecondary = smoothstep(0.0, uEdgeBlendWidth, edgeDist);
      color = mix(primary, secondary, toSecondary);
    }

    if (uWoodlandMode > 0.5) {
      float meadowPatch = noise(vWorldOffset * 0.018);
      float broadPatch = noise(vWorldOffset * 0.006 + vec2(17.3, 8.1));
      vec3 warmGrass = vec3(0.47, 0.64, 0.26);
      vec3 coolGrass = vec3(0.24, 0.46, 0.18);
      vec3 dryGrass = vec3(0.58, 0.51, 0.29);
      vec3 patchColor = mix(coolGrass, warmGrass, meadowPatch);
      patchColor = mix(patchColor, dryGrass, smoothstep(0.58, 0.9, broadPatch) * 0.28);
      float outsidePad = smoothstep(0.0, uEdgeBlendWidth * 2.5, edgeDist);
      float heightTone = clamp(vWorldPos.y / 18.0, -0.22, 0.28);
      color = mix(color, patchColor * (1.0 + heightTone), outsidePad * 0.42);
    }

    if (uUrbanMode > 0.5) {
      float blockPatch = noise(vWorldOffset * 0.018);
      float finePatch = noise(vWorldOffset * 0.06);
      vec3 asphaltTone = mix(vec3(0.31, 0.32, 0.34), vec3(0.42, 0.42, 0.40), blockPatch);
      float outsidePad = smoothstep(0.0, uEdgeBlendWidth * 4.0, edgeDist);
      color = mix(color, asphaltTone * (0.94 + finePatch * 0.07), outsidePad * 0.22);
    }

    if (uHorizonBlend > 0.5) {
      color = mix(uHorizonColor, color, edgeFade);
    }

    fragColor = vec4(color, edgeFade);
  }
`;

export interface GroundPlaneManagerOptions {
  scene: THREE.Scene;
  getMaxAnisotropy?: () => number;
}

export class GroundPlaneManager {
  private scene: THREE.Scene;
  private getMaxAnisotropy: () => number;
  private detailMesh: THREE.Mesh | null = null;
  private detailMaterial: THREE.ShaderMaterial | null = null;
  private technoMesh: THREE.Mesh | null = null;
  private technoMaterial: THREE.ShaderMaterial | null = null;
  private technoGeometry: THREE.PlaneGeometry | null = null;
  private technoElapsed = 0;
  private flatGeometry: THREE.PlaneGeometry | null = null;
  private hillsGeometry: THREE.PlaneGeometry | null = null;
  private textureLoader = new THREE.TextureLoader();
  private activePreset: GroundPresetId = 'blank';
  private activeTheme: 'light' | 'dark' = 'dark';
  private loadedTextures = new Map<string, THREE.Texture>();
  /** Last pad half-extents used for hills + tree placement. */
  private lastPadHalf = new THREE.Vector2(1, 1);
  private lastFacilityHalf = new THREE.Vector2(1, 1);
  private lastFadeStart = 0;
  private lastOuterFade = 1;
  private lastCenter = new THREE.Vector3();
  private lastEnvironmentSeed = 'blulok-default';
  private lastBounds = new THREE.Box3();

  constructor(options: GroundPlaneManagerOptions) {
    this.scene = options.scene;
    this.getMaxAnisotropy = options.getMaxAnisotropy ?? (() => 8);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.activeTheme = theme;
    this.syncHorizonUniform();
  }

  getActivePreset(): GroundPresetId {
    return this.activePreset;
  }

  /** Pad half-size, fade start, and center from the last bounds update (woodland scenery). */
  getSceneryLayoutMetrics(): {
    padHalfX: number;
    padHalfZ: number;
    fadeStart: number;
    outerFade: number;
    centerX: number;
    centerZ: number;
    facilityHalfX: number;
    facilityHalfZ: number;
  } | null {
    if (this.activePreset !== 'woodland' && this.activePreset !== 'urban') return null;
    return {
      padHalfX: this.lastPadHalf.x,
      padHalfZ: this.lastPadHalf.y,
      fadeStart: this.lastFadeStart,
      outerFade: this.lastOuterFade,
      centerX: this.lastCenter.x,
      centerZ: this.lastCenter.z,
      facilityHalfX: this.lastFacilityHalf.x,
      facilityHalfZ: this.lastFacilityHalf.y,
    };
  }

  /** Backward-compatible woodland caller. */
  getWoodlandLayoutMetrics(): ReturnType<GroundPlaneManager['getSceneryLayoutMetrics']> {
    return this.activePreset === 'woodland' ? this.getSceneryLayoutMetrics() : null;
  }

  update(_camera: THREE.Camera, deltaSeconds = 0, worldPerPixel?: number): void {
    if (this.activePreset === 'techno' && this.technoMaterial) {
      this.technoElapsed += deltaSeconds;
      this.technoMaterial.uniforms.uTime.value = this.technoElapsed;
      if (worldPerPixel !== undefined && Number.isFinite(worldPerPixel) && worldPerPixel > 0) {
        this.technoMaterial.uniforms.uWorldPerPixel.value = worldPerPixel;
      }
    }
  }

  async applyPreset(
    preset: GroundPresetId,
    bounds: THREE.Box3,
    options?: ScenePresetApplyOptions
  ): Promise<void> {
    this.activePreset = preset;

    if (preset === 'blank' || preset === 'grid') {
      options?.onAssetProgress?.(1);
      this.hide();
      return;
    }

    if (preset === 'techno') {
      options?.onAssetProgress?.(1);
      if (this.detailMesh) this.detailMesh.visible = false;
      this.ensureTechnoMesh();
      this.positionTechnoMesh(bounds, options);
      const showGrid = resolveEnvironmentOptions(options?.environmentOptions).techno.showGrid;
      if (this.technoMesh) this.technoMesh.visible = showGrid;
      return;
    }

    this.hideTechno();

    options?.onAssetProgress?.(0);

    const needsConcrete =
      preset === 'concrete' || preset === 'natural' || preset === 'woodland' || preset === 'urban';
    const needsGrass = preset === 'grass' || preset === 'natural' || preset === 'woodland';

    const [concrete, grass, concreteNormal, grassNormal] = await Promise.all([
      needsConcrete ? this.loadTexture(GROUND_PRESET_ASSETS.concreteDiffuse) : Promise.resolve(null),
      needsGrass ? this.loadTexture(GROUND_PRESET_ASSETS.grassDiffuse) : Promise.resolve(null),
      needsConcrete ? this.loadTexture(GROUND_PRESET_ASSETS.concreteNormal) : Promise.resolve(null),
      needsGrass ? this.loadTexture(GROUND_PRESET_ASSETS.grassNormal) : Promise.resolve(null),
    ]);
    if (this.activePreset !== preset) return;

    const primary = preset === 'grass' ? grass : concrete;
    if (!primary) {
      console.warn('[GroundPlaneManager] Ground texture failed to load for preset:', preset);
      this.hide();
      return;
    }

    this.ensureMesh();
    if (!this.detailMaterial || this.activePreset !== preset) return;

    const u = this.detailMaterial.uniforms;
    u.uHasNormals.value = needsGrass || needsConcrete ? 1 : 0;
    u.uHorizonBlend.value =
      preset === 'grass' || preset === 'natural' || preset === 'woodland' || preset === 'urban'
        ? 1
        : 0;
    u.uSunDirection.value.copy(SUN_DIRECTION);
    this.syncHorizonUniform(preset);

    const isDualLayer = preset === 'natural' || preset === 'woodland';
    if (isDualLayer) {
      u.uPrimaryMap.value = concrete;
      u.uSecondaryMap.value = grass ?? concrete;
      u.uPrimaryNormal.value = concreteNormal ?? concrete;
      u.uSecondaryNormal.value = grassNormal ?? grass ?? concrete;
      u.uHasSecondary.value = 1;
      this.applyTintUniforms(
        u,
        preset === 'woodland' ? TEXTURE_TINTS.woodlandConcrete : TEXTURE_TINTS.concrete,
        preset === 'woodland' ? TEXTURE_TINTS.woodlandGrass : TEXTURE_TINTS.grass
      );
      u.uTileSize.value =
        preset === 'woodland' ? TILE_WORLD_SIZE.woodland : TILE_WORLD_SIZE.natural;
    } else {
      const tint =
        preset === 'grass'
          ? TEXTURE_TINTS.grass
          : preset === 'urban'
            ? TEXTURE_TINTS.urbanConcrete
            : TEXTURE_TINTS.concrete;
      const normal = preset === 'grass' ? grassNormal : concreteNormal;
      u.uPrimaryMap.value = primary;
      u.uSecondaryMap.value = primary;
      u.uPrimaryNormal.value = normal ?? primary;
      u.uSecondaryNormal.value = normal ?? primary;
      u.uHasSecondary.value = 0;
      this.applyTintUniforms(u, tint, tint);
      u.uTileSize.value =
        preset === 'grass'
          ? TILE_WORLD_SIZE.grass
          : preset === 'urban'
            ? TILE_WORLD_SIZE.urban
            : TILE_WORLD_SIZE.concrete;
    }
    u.uWoodlandMode.value = preset === 'woodland' ? 1 : 0;
    u.uUrbanMode.value = preset === 'urban' ? 1 : 0;

    this.setHillsEnabled(preset === 'woodland', options?.environmentSeed ?? 'blulok-default', options);
    this.applyEnvironmentUniformOverrides(preset, options);
    this.positionMesh(bounds, options);
    this.detailMesh!.visible = true;
    options?.onAssetProgress?.(1);
  }

  updateBounds(bounds: THREE.Box3, options?: ScenePresetApplyOptions): void {
    if (this.activePreset === 'blank' || this.activePreset === 'grid') return;
    if (this.activePreset === 'techno') {
      if (!this.technoMesh) return;
      this.positionTechnoMesh(bounds, options);
      return;
    }
    if (!this.detailMesh) return;
    this.positionMesh(bounds, options);
  }

  hide(): void {
    if (this.detailMesh) this.detailMesh.visible = false;
    this.hideTechno();
  }

  /** Refresh techno grid visibility and shader uniforms. */
  applyTechnoOptions(techno: TechnoEnvironmentOptions, options?: ScenePresetApplyOptions): void {
    if (this.activePreset !== 'techno' || !this.technoMesh) return;
    this.technoMesh.visible = techno.showGrid ?? true;
    if (!this.lastBounds.isEmpty()) {
      this.positionTechnoMesh(this.lastBounds, {
        ...options,
        environmentOptions: {
          ...options?.environmentOptions,
          techno,
        },
      });
    } else if (this.technoMaterial) {
      applyTechnoGridUniforms(this.technoMaterial, techno);
    }
  }

  private hideTechno(): void {
    if (this.technoMesh) this.technoMesh.visible = false;
  }

  private applyTintUniforms(
    u: Record<string, THREE.IUniform>,
    primary: TextureTint,
    secondary: TextureTint
  ): void {
    (u.uPrimaryTint.value as THREE.Color).set(primary.color);
    u.uPrimaryTintMix.value = primary.mix;
    u.uPrimaryBrightness.value = primary.brightness;
    u.uPrimarySaturation.value = primary.saturation;
    (u.uSecondaryTint.value as THREE.Color).set(secondary.color);
    u.uSecondaryTintMix.value = secondary.mix;
    u.uSecondaryBrightness.value = secondary.brightness;
    u.uSecondarySaturation.value = secondary.saturation;
  }

  private syncHorizonUniform(preset?: GroundPresetId): void {
    if (!this.detailMaterial) return;
    const effectivePreset = preset ?? this.activePreset;
    const color =
      effectivePreset === 'natural' ||
      effectivePreset === 'grass' ||
      effectivePreset === 'woodland' ||
      effectivePreset === 'urban'
        ? HORIZON_COLOR
        : THEME_BACKGROUND_COLORS[this.activeTheme];
    (this.detailMaterial.uniforms.uHorizonColor.value as THREE.Color).set(color);
  }

  private ensureMesh(): void {
    if (this.detailMesh) return;

    this.flatGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.flatGeometry.rotateX(-Math.PI / 2);
    // Higher tessellation so carved river/pond banks read smoothly, not faceted.
    this.hillsGeometry = new THREE.PlaneGeometry(1, 1, 240, 240);
    this.hillsGeometry.rotateX(-Math.PI / 2);

    this.detailMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uPrimaryMap: { value: null },
        uSecondaryMap: { value: null },
        uPrimaryNormal: { value: null },
        uSecondaryNormal: { value: null },
        uHasSecondary: { value: 0 },
        uHasNormals: { value: 0 },
        uPrimaryTint: { value: new THREE.Color(TEXTURE_TINTS.grass.color) },
        uPrimaryTintMix: { value: TEXTURE_TINTS.grass.mix },
        uSecondaryTint: { value: new THREE.Color(TEXTURE_TINTS.grass.color) },
        uSecondaryTintMix: { value: TEXTURE_TINTS.grass.mix },
        uPrimaryBrightness: { value: TEXTURE_TINTS.grass.brightness },
        uSecondaryBrightness: { value: TEXTURE_TINTS.grass.brightness },
        uPrimarySaturation: { value: TEXTURE_TINTS.grass.saturation },
        uSecondarySaturation: { value: TEXTURE_TINTS.grass.saturation },
        uSunDirection: { value: SUN_DIRECTION.clone() },
        uHorizonColor: { value: new THREE.Color(HORIZON_COLOR) },
        uHorizonBlend: { value: 1 },
        uPlaneSize: { value: 1 },
        uFacilityHalf: { value: new THREE.Vector2(1, 1) },
        uHillFlatHalf: { value: new THREE.Vector2(1, 1) },
        uEdgeBlendWidth: { value: 0.45 },
        uFadeStart: { value: 0 },
        uOuterFade: { value: 1 },
        uTileSize: { value: TILE_WORLD_SIZE.grass },
        uDiffuseBias: { value: DIFFUSE_MIP_BIAS },
        uDetailBias: { value: DETAIL_MIP_BIAS },
        uWoodlandMode: { value: 0 },
        uUrbanMode: { value: 0 },
        uHillSeed: { value: new THREE.Vector2(0.5, 0.5) },
        uHillAmplitude: { value: WOODLAND_HILL_AMPLITUDE },
        uHillNoiseScale: { value: WOODLAND_HILL_NOISE_SCALE },
        uWaterEnabled: { value: 0 },
        uWaterLevelY: { value: -0.6 },
        uWaterBedDepth: { value: 3.2 },
        uWaterBankWidth: { value: 12 },
        uWaterUnderSlope: { value: 0.5 },
        uRiverCount: { value: 0 },
        uRiverPoints: {
          value: Array.from({ length: WOODLAND_RIVER_UNIFORM_COUNT }, () => new THREE.Vector2()),
        },
        uRiverHalfWidths: {
          value: Array.from({ length: WOODLAND_RIVER_UNIFORM_COUNT }, () => 6),
        },
        uPondCount: { value: 0 },
        uPondCenters: {
          value: Array.from({ length: WOODLAND_MAX_PONDS }, () => new THREE.Vector2()),
        },
        uPondRadiiArr: {
          value: Array.from({ length: WOODLAND_MAX_PONDS }, () => new THREE.Vector2(1, 1)),
        },
      },
      vertexShader: FADE_VERTEX_SHADER,
      fragmentShader: FADE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: true,
    });

    this.detailMesh = new THREE.Mesh(this.flatGeometry, this.detailMaterial);
    this.detailMesh.position.y = -0.005;
    this.detailMesh.renderOrder = -90;
    this.detailMesh.frustumCulled = false;
    this.detailMesh.userData.isViewerGroundPlane = true;
    this.scene.add(this.detailMesh);
  }

  private applyEnvironmentUniformOverrides(
    preset: GroundPresetId,
    options?: ScenePresetApplyOptions
  ): void {
    if (!this.detailMaterial) return;
    const resolved = resolveEnvironmentOptions(options?.environmentOptions);
    const ground = resolved.ground;
    const u = this.detailMaterial.uniforms;

    if (ground.primaryTint) (u.uPrimaryTint.value as THREE.Color).set(ground.primaryTint);
    if (ground.secondaryTint) (u.uSecondaryTint.value as THREE.Color).set(ground.secondaryTint);
    if (options?.environmentOptions?.ground?.primaryTintMix !== undefined) {
      u.uPrimaryTintMix.value = ground.primaryTintMix!;
    }
    if (options?.environmentOptions?.ground?.secondaryTintMix !== undefined) {
      u.uSecondaryTintMix.value = ground.secondaryTintMix!;
    }
    if (options?.environmentOptions?.ground?.primaryBrightness !== undefined) {
      u.uPrimaryBrightness.value = ground.primaryBrightness!;
    }
    if (options?.environmentOptions?.ground?.secondaryBrightness !== undefined) {
      u.uSecondaryBrightness.value = ground.secondaryBrightness!;
    }
    if (options?.environmentOptions?.ground?.primarySaturation !== undefined) {
      u.uPrimarySaturation.value = ground.primarySaturation!;
    }
    if (options?.environmentOptions?.ground?.secondarySaturation !== undefined) {
      u.uSecondarySaturation.value = ground.secondarySaturation!;
    }
    if (ground.horizonColor) (u.uHorizonColor.value as THREE.Color).set(ground.horizonColor);

    if (preset === 'woodland') {
      const resolvedWoodland = resolveEnvironmentOptions(options?.environmentOptions).woodland;
      u.uHillAmplitude.value = resolvedWoodland.hillAmplitude ?? WOODLAND_HILL_AMPLITUDE;
      u.uHillNoiseScale.value = resolvedWoodland.hillScale ?? WOODLAND_HILL_NOISE_SCALE;
    }
  }

  private setHillsEnabled(
    enabled: boolean,
    environmentSeed: string,
    options?: ScenePresetApplyOptions
  ): void {
    if (!this.detailMesh || !this.detailMaterial) return;

    this.lastEnvironmentSeed = environmentSeed;
    const seed = hillSeedVec2(environmentSeed);
    const woodland = resolveEnvironmentOptions(options?.environmentOptions).woodland;
    (this.detailMaterial.uniforms.uHillSeed.value as THREE.Vector2).set(seed.x, seed.y);
    this.detailMaterial.uniforms.uHillAmplitude.value =
      woodland.hillAmplitude ?? WOODLAND_HILL_AMPLITUDE;
    this.detailMaterial.uniforms.uHillNoiseScale.value =
      woodland.hillScale ?? WOODLAND_HILL_NOISE_SCALE;
    this.detailMaterial.vertexShader = enabled ? HILLS_VERTEX_SHADER : FADE_VERTEX_SHADER;
    this.detailMaterial.needsUpdate = true;
    this.detailMesh.geometry = enabled ? this.hillsGeometry! : this.flatGeometry!;
  }

  private positionMesh(bounds: THREE.Box3, options?: ScenePresetApplyOptions): void {
    if (!this.detailMesh || !this.detailMaterial) return;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    const halfX = Math.max(size.x, 1) / 2;
    const halfZ = Math.max(size.z, 1) / 2;
    const isNaturalLike =
      this.activePreset === 'natural' ||
      this.activePreset === 'woodland' ||
      this.activePreset === 'urban';
    const padHalfX = isNaturalLike ? halfX + size.x * PAD_EDGE_MARGIN_RATIO : halfX;
    const padHalfZ = isNaturalLike ? halfZ + size.z * PAD_EDGE_MARGIN_RATIO : halfZ;
    const maxHalf = Math.max(padHalfX, padHalfZ);
    const maxDim = Math.max(size.x, size.z, 8);

    this.lastCenter.copy(center);
    this.lastFacilityHalf.set(halfX, halfZ);
    this.lastPadHalf.set(padHalfX, padHalfZ);

    let fadeStart: number;
    let outerFade: number;

    if (isNaturalLike) {
      fadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.55, 14, 75);
      outerFade = fadeStart + THREE.MathUtils.clamp(maxDim * 2.4, 170, 1300);
    } else {
      fadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.3, 8, 50);
      outerFade = fadeStart + THREE.MathUtils.clamp(maxDim * 2.0, 140, 1000);
    }

    const groundOpts = resolveEnvironmentOptions(options?.environmentOptions).ground;
    if (options?.environmentOptions?.ground?.fadeStartScale !== undefined) {
      fadeStart *= groundOpts.fadeStartScale ?? 1;
    }
    if (options?.environmentOptions?.ground?.outerFadeScale !== undefined) {
      outerFade *= groundOpts.outerFadeScale ?? 1;
    }

    const planeRadius = outerFade * 1.3;
    const planeSize = planeRadius * 2;

    this.detailMesh.position.set(center.x, -0.005, center.z);
    this.detailMesh.scale.set(planeSize, 1, planeSize);

    const u = this.detailMaterial.uniforms;
    u.uPlaneSize.value = planeSize;
    (u.uFacilityHalf.value as THREE.Vector2).set(padHalfX, padHalfZ);
    const hillFlatHalf = woodlandHillClearingHalf(padHalfX, padHalfZ);
    (u.uHillFlatHalf.value as THREE.Vector2).set(hillFlatHalf.x, hillFlatHalf.z);
    u.uEdgeBlendWidth.value = isNaturalLike
      ? THREE.MathUtils.clamp(maxDim * 0.018, 0.28, 0.55)
      : 0.45;
    u.uFadeStart.value = fadeStart;
    u.uOuterFade.value = outerFade;
    this.lastFadeStart = fadeStart;
    this.lastOuterFade = outerFade;

    this.applyWaterUniforms(center, padHalfX, padHalfZ, halfX, halfZ, fadeStart, outerFade, options);
  }

  /** Push the deterministic woodland water layout into the hills-shader uniforms. */
  private applyWaterUniforms(
    center: THREE.Vector3,
    padHalfX: number,
    padHalfZ: number,
    facilityHalfX: number,
    facilityHalfZ: number,
    fadeStart: number,
    outerFade: number,
    options?: ScenePresetApplyOptions
  ): void {
    if (!this.detailMaterial) return;
    const u = this.detailMaterial.uniforms;

    if (this.activePreset !== 'woodland') {
      u.uWaterEnabled.value = 0;
      u.uRiverCount.value = 0;
      u.uPondCount.value = 0;
      return;
    }

    const woodland = resolveEnvironmentOptions(options?.environmentOptions).woodland;
    const layout = computeWoodlandWaterLayout(
      {
        centerX: center.x,
        centerZ: center.z,
        padHalfX,
        padHalfZ,
        facilityHalfX,
        facilityHalfZ,
        fadeStart,
        outerFade,
      },
      this.lastEnvironmentSeed,
      waterOptionsFrom(woodland)
    );

    this.writeWaterUniforms(layout, center);
  }

  private writeWaterUniforms(layout: WoodlandWaterLayout, center: THREE.Vector3): void {
    if (!this.detailMaterial) return;
    const u = this.detailMaterial.uniforms;

    u.uWaterEnabled.value = layout.enabled ? 1 : 0;
    if (!layout.enabled) {
      u.uRiverCount.value = 0;
      u.uPondCount.value = 0;
      return;
    }

    u.uWaterLevelY.value = layout.waterLevelY;
    u.uWaterBedDepth.value = layout.bedDepth;
    u.uWaterBankWidth.value = layout.bankWidth;
    u.uWaterUnderSlope.value = layout.underSlope;

    // Rivers are packed into fixed-size slots (river r occupies indices
    // [r*PC, r*PC + PC-1]); uRiverCount tells the shader how many are active.
    const riverPoints = u.uRiverPoints.value as THREE.Vector2[];
    const riverHalfWidths = u.uRiverHalfWidths.value as number[];
    u.uRiverCount.value = Math.min(layout.rivers.length, WOODLAND_MAX_RIVERS);
    for (let r = 0; r < WOODLAND_MAX_RIVERS; r++) {
      const river = layout.rivers[r];
      for (let s = 0; s < WOODLAND_RIVER_POINT_COUNT; s++) {
        const idx = r * WOODLAND_RIVER_POINT_COUNT + s;
        if (river) {
          const pt = river.points[Math.min(s, river.points.length - 1)];
          // Uniforms are stored relative to the mesh center (matches vWorldOffset).
          riverPoints[idx].set(pt.x - center.x, pt.z - center.z);
          riverHalfWidths[idx] = river.halfWidths[Math.min(s, river.halfWidths.length - 1)];
        } else {
          riverPoints[idx].set(0, 0);
          riverHalfWidths[idx] = 0;
        }
      }
    }

    const pondCenters = u.uPondCenters.value as THREE.Vector2[];
    const pondRadii = u.uPondRadiiArr.value as THREE.Vector2[];
    u.uPondCount.value = Math.min(layout.ponds.length, WOODLAND_MAX_PONDS);
    for (let p = 0; p < WOODLAND_MAX_PONDS; p++) {
      const pond = layout.ponds[p];
      if (pond) {
        pondCenters[p].set(pond.cx - center.x, pond.cz - center.z);
        pondRadii[p].set(pond.rx, pond.rz);
      } else {
        pondCenters[p].set(0, 0);
        pondRadii[p].set(1, 1);
      }
    }
  }

  private ensureTechnoMesh(): void {
    if (this.technoMesh) return;

    this.technoGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.technoGeometry.rotateX(-Math.PI / 2);
    this.technoMaterial = createTechnoGridMaterial();
    this.technoMesh = new THREE.Mesh(this.technoGeometry, this.technoMaterial);
    this.technoMesh.position.y = -0.004;
    this.technoMesh.renderOrder = -88;
    this.technoMesh.frustumCulled = false;
    this.technoMesh.userData.isViewerGroundPlane = true;
    this.scene.add(this.technoMesh);
  }

  private positionTechnoMesh(bounds: THREE.Box3, options?: ScenePresetApplyOptions): void {
    if (!this.technoMesh || !this.technoMaterial) return;

    this.lastBounds.copy(bounds);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    const halfX = Math.max(size.x, 1) / 2;
    const halfZ = Math.max(size.z, 1) / 2;
    const maxHalf = Math.max(halfX, halfZ);
    const maxDim = Math.max(size.x, size.z, 8);

    this.lastCenter.copy(center);
    this.lastFacilityHalf.set(halfX, halfZ);
    this.lastPadHalf.set(halfX, halfZ);

    let fadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.35, 10, 55);
    let outerFade = fadeStart + THREE.MathUtils.clamp(maxDim * 2.2, 150, 1100);

    const technoOpts = resolveEnvironmentOptions(options?.environmentOptions).techno;
    fadeStart *= technoOpts.fadeStartScale ?? 1;
    outerFade *= technoOpts.outerFadeScale ?? 1;

    const planeRadius = outerFade * 1.35;
    const planeSize = planeRadius * 2;

    this.technoMesh.position.set(center.x, -0.004, center.z);
    this.technoMesh.scale.set(planeSize, 1, planeSize);

    const u = this.technoMaterial.uniforms;
    u.uPlaneSize.value = planeSize;
    (u.uFacilityHalf.value as THREE.Vector2).set(halfX, halfZ);
    (u.uContentCenter.value as THREE.Vector2).set(0, 0);
    u.uFadeStart.value = fadeStart;
    u.uOuterFade.value = outerFade;
    this.lastFadeStart = fadeStart;
    this.lastOuterFade = outerFade;

    applyTechnoGridUniforms(this.technoMaterial, technoOpts);
  }

  private loadTexture(url: string): Promise<THREE.Texture | null> {
    const cached = this.loadedTextures.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = url.includes('normal')
            ? THREE.LinearSRGBColorSpace
            : THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = this.getMaxAnisotropy();
          tex.needsUpdate = true;
          this.loadedTextures.set(url, tex);
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });
  }

  dispose(): void {
    if (this.detailMesh) {
      this.scene.remove(this.detailMesh);
      this.detailMesh = null;
    }
    if (this.technoMesh) {
      this.scene.remove(this.technoMesh);
      this.technoMesh = null;
    }
    this.flatGeometry?.dispose();
    this.hillsGeometry?.dispose();
    this.technoGeometry?.dispose();
    this.flatGeometry = null;
    this.hillsGeometry = null;
    this.technoGeometry = null;
    if (this.detailMaterial) {
      this.detailMaterial.dispose();
      this.detailMaterial = null;
    }
    if (this.technoMaterial) {
      this.technoMaterial.dispose();
      this.technoMaterial = null;
    }
    this.loadedTextures.forEach((t) => t.dispose());
    this.loadedTextures.clear();
  }
}
