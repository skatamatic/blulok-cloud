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
  type ScenePresetApplyOptions,
} from './ScenePresets';

const TILE_WORLD_SIZE: Record<'grass' | 'concrete' | 'natural', number> = {
  grass: 1.8,
  concrete: 5.5,
  natural: 1.9,
};

/** Modest bias — enough for mid-distance detail without shimmer. */
const DIFFUSE_MIP_BIAS = -0.45;
const DETAIL_MIP_BIAS = -0.6;

const TEXTURE_TINTS = {
  grass: { color: '#a4dc6a', mix: 0.14, brightness: 1.2, saturation: 1.28 },
  concrete: { color: '#c4c8ce', mix: 0.2, brightness: 1.05, saturation: 1.02 },
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
  private textureLoader = new THREE.TextureLoader();
  private activePreset: GroundPresetId = 'blank';
  private activeTheme: 'light' | 'dark' = 'dark';
  private loadedTextures = new Map<string, THREE.Texture>();

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

  update(_camera: THREE.Camera): void {
    // Reserved for future per-frame uniforms; no camera haze (it washed the scene).
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

    options?.onAssetProgress?.(0);

    const needsConcrete = preset === 'concrete' || preset === 'natural';
    const needsGrass = preset === 'grass' || preset === 'natural';

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
    u.uHorizonBlend.value = preset === 'grass' || preset === 'natural' ? 1 : 0;
    u.uSunDirection.value.copy(SUN_DIRECTION);
    this.syncHorizonUniform(preset);

    if (preset === 'natural') {
      u.uPrimaryMap.value = concrete;
      u.uSecondaryMap.value = grass ?? concrete;
      u.uPrimaryNormal.value = concreteNormal ?? concrete;
      u.uSecondaryNormal.value = grassNormal ?? grass ?? concrete;
      u.uHasSecondary.value = 1;
      this.applyTintUniforms(u, TEXTURE_TINTS.concrete, TEXTURE_TINTS.grass);
      u.uTileSize.value = TILE_WORLD_SIZE.natural;
    } else {
      const tint = preset === 'grass' ? TEXTURE_TINTS.grass : TEXTURE_TINTS.concrete;
      const normal = preset === 'grass' ? grassNormal : concreteNormal;
      u.uPrimaryMap.value = primary;
      u.uSecondaryMap.value = primary;
      u.uPrimaryNormal.value = normal ?? primary;
      u.uSecondaryNormal.value = normal ?? primary;
      u.uHasSecondary.value = 0;
      this.applyTintUniforms(u, tint, tint);
      u.uTileSize.value =
        preset === 'grass' ? TILE_WORLD_SIZE.grass : TILE_WORLD_SIZE.concrete;
    }

    this.positionMesh(bounds);
    this.detailMesh!.visible = true;
    options?.onAssetProgress?.(1);
  }

  updateBounds(bounds: THREE.Box3): void {
    if (this.activePreset === 'blank' || this.activePreset === 'grid') return;
    if (!this.detailMesh) return;
    this.positionMesh(bounds);
  }

  hide(): void {
    if (this.detailMesh) this.detailMesh.visible = false;
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
    const color =
      preset === 'natural' || preset === 'grass'
        ? HORIZON_COLOR
        : THEME_BACKGROUND_COLORS[this.activeTheme];
    (this.detailMaterial.uniforms.uHorizonColor.value as THREE.Color).set(color);
  }

  private ensureMesh(): void {
    if (this.detailMesh) return;

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    geometry.rotateX(-Math.PI / 2);

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
        uEdgeBlendWidth: { value: 0.45 },
        uFadeStart: { value: 0 },
        uOuterFade: { value: 1 },
        uTileSize: { value: TILE_WORLD_SIZE.grass },
        uDiffuseBias: { value: DIFFUSE_MIP_BIAS },
        uDetailBias: { value: DETAIL_MIP_BIAS },
      },
      vertexShader: FADE_VERTEX_SHADER,
      fragmentShader: FADE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: true,
    });

    this.detailMesh = new THREE.Mesh(geometry, this.detailMaterial);
    this.detailMesh.position.y = -0.005;
    this.detailMesh.renderOrder = -90;
    this.detailMesh.frustumCulled = false;
    this.detailMesh.userData.isViewerGroundPlane = true;
    this.scene.add(this.detailMesh);
  }

  private positionMesh(bounds: THREE.Box3): void {
    if (!this.detailMesh || !this.detailMaterial) return;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    const halfX = Math.max(size.x, 1) / 2;
    const halfZ = Math.max(size.z, 1) / 2;
    const padHalfX =
      this.activePreset === 'natural'
        ? halfX + size.x * PAD_EDGE_MARGIN_RATIO
        : halfX;
    const padHalfZ =
      this.activePreset === 'natural'
        ? halfZ + size.z * PAD_EDGE_MARGIN_RATIO
        : halfZ;
    const maxHalf = Math.max(padHalfX, padHalfZ);
    const maxDim = Math.max(size.x, size.z, 8);

    let fadeStart: number;
    let outerFade: number;

    if (this.activePreset === 'natural') {
      fadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.55, 14, 75);
      outerFade = fadeStart + THREE.MathUtils.clamp(maxDim * 2.4, 170, 1300);
    } else {
      fadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.3, 8, 50);
      outerFade = fadeStart + THREE.MathUtils.clamp(maxDim * 2.0, 140, 1000);
    }

    const planeRadius = outerFade * 1.3;
    const planeSize = planeRadius * 2;

    this.detailMesh.position.set(center.x, -0.005, center.z);
    this.detailMesh.scale.set(planeSize, 1, planeSize);

    const u = this.detailMaterial.uniforms;
    u.uPlaneSize.value = planeSize;
    (u.uFacilityHalf.value as THREE.Vector2).set(padHalfX, padHalfZ);
    u.uEdgeBlendWidth.value =
      this.activePreset === 'natural'
        ? THREE.MathUtils.clamp(maxDim * 0.018, 0.28, 0.55)
        : 0.45;
    u.uFadeStart.value = fadeStart;
    u.uOuterFade.value = outerFade;
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
      this.detailMesh.geometry.dispose();
      this.detailMesh = null;
    }
    if (this.detailMaterial) {
      this.detailMaterial.dispose();
      this.detailMaterial = null;
    }
    this.loadedTextures.forEach((t) => t.dispose());
    this.loadedTextures.clear();
  }
}
