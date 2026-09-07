/**
 * Builds the animated woodland water surface (river ribbon + pond) from a
 * {@link WoodlandWaterLayout}. The surface is a custom-shaded translucent mesh
 * with procedural ripples, fresnel sky reflection, and a sun glint. It sits at
 * the still-water level while the terrain (carved by the same layout) dips below
 * it, producing visible banks and depth.
 */

import * as THREE from 'three';
import type {
  WoodlandPondLayout,
  WoodlandRiverLayout,
  WoodlandWaterLayout,
} from './woodlandWater';

/** Keep in sync with GroundPlaneManager's SUN_DIRECTION for consistent glints. */
const WATER_SUN_DIRECTION = new THREE.Vector3(0.38, 0.9, 0.2).normalize();

const WATER_VERTEX_SHADER = /* glsl */ `
  out vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform float uOpacity;
  uniform vec2 uWaterCenter;
  uniform float uFadeStart;
  uniform float uFadeEnd;

  in vec3 vWorldPos;
  out vec4 fragColor;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Organic, drifting ripple height. Domain-warped fbm + a slow swell keeps the
  // surface from reading as a regular grid.
  float waveHeight(vec2 p, float t) {
    vec2 flow = vec2(0.65, 0.28);
    vec2 q = p * 0.22;
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    float h = 0.0;
    float amp = 0.6;
    vec2 sp = q + flow * t * 0.06;
    for (int i = 0; i < 4; i++) {
      h += amp * vnoise(sp);
      sp = m * sp * 2.0 - flow * t * 0.04;
      amp *= 0.5;
    }
    h += 0.18 * sin(dot(p, vec2(0.7, 0.45)) * 0.35 + t * 0.9);
    return h;
  }

  // Surface normal via finite differences of the ripple height field.
  vec3 rippleNormal(vec2 p, float t) {
    float e = 0.7;
    float hx = waveHeight(p + vec2(e, 0.0), t) - waveHeight(p - vec2(e, 0.0), t);
    float hz = waveHeight(p + vec2(0.0, e), t) - waveHeight(p - vec2(0.0, e), t);
    float bump = 0.55;
    return normalize(vec3(-hx * bump, 1.0, -hz * bump));
  }

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 n = rippleNormal(p, uTime);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float fres = pow(clamp(1.0 - max(dot(viewDir, n), 0.0), 0.0, 1.0), 3.0);

    // Subtle depth variation from the ripple field so the body isn't flat.
    float shade = waveHeight(p, uTime) - 0.5;
    vec3 body = mix(uDeep, uShallow, clamp(0.4 + shade * 0.35, 0.0, 1.0));
    vec3 color = mix(body, uSky, fres * 0.6);

    // Broader, softer sun glint that breaks up across the ripples.
    vec3 halfVec = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfVec), 0.0), 80.0);
    color += spec * vec3(1.0, 0.97, 0.88) * 0.6;

    float alpha = mix(uOpacity, 0.95, fres);

    // Radial fade so distant water disappears with the ground at the horizon.
    float dist = length(p - uWaterCenter);
    alpha *= 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
    if (alpha < 0.01) discard;

    fragColor = vec4(color, alpha);
  }
`;

export interface WoodlandWaterSurface {
  group: THREE.Group;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
}

function buildRiverGeometry(
  river: WoodlandRiverLayout,
  waterLevelY: number
): THREE.BufferGeometry | null {
  if (!river || river.points.length < 2) return null;

  const y = waterLevelY;
  const curve = new THREE.CatmullRomCurve3(
    river.points.map((p) => new THREE.Vector3(p.x, y, p.z)),
    false,
    'catmullrom',
    0.5
  );

  const divisions = Math.max(96, river.points.length * 18);
  const samples = curve.getPoints(divisions);
  const lastControl = river.halfWidths.length - 1;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(i - 1, 0)];
    const next = samples[Math.min(i + 1, samples.length - 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len;
    const pz = tx / len;
    const c = samples[i];

    // Interpolate the control-point half-widths along the curve so the ribbon
    // pinches and widens just like the carved channel. Tuck slightly under the
    // banks so there is no shoreline gap.
    const u = (i / (samples.length - 1)) * lastControl;
    const lo = Math.floor(u);
    const hi = Math.min(lo + 1, lastControl);
    const frac = u - lo;
    const half = river.halfWidths[lo] + (river.halfWidths[hi] - river.halfWidths[lo]) * frac + 0.6;

    positions.push(c.x + px * half, y, c.z + pz * half);
    positions.push(c.x - px * half, y, c.z - pz * half);
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildPondGeometry(
  pond: WoodlandPondLayout,
  waterLevelY: number
): THREE.BufferGeometry | null {
  if (!pond) return null;

  const y = waterLevelY;
  const segments = 72;
  const positions: number[] = [pond.cx, y, pond.cz];
  const indices: number[] = [];

  // Slight overlap so the disk tucks under the carved bank.
  const rx = pond.rx + 0.6;
  const rz = pond.rz + 0.6;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(pond.cx + Math.cos(a) * rx, y, pond.cz + Math.sin(a) * rz);
  }
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createWoodlandWaterSurface(
  layout: WoodlandWaterLayout
): WoodlandWaterSurface | null {
  if (!layout.enabled) return null;

  const builtGeometries: THREE.BufferGeometry[] = [];
  for (const river of layout.rivers) {
    const geometry = buildRiverGeometry(river, layout.waterLevelY);
    if (geometry) builtGeometries.push(geometry);
  }
  for (const pond of layout.ponds) {
    const geometry = buildPondGeometry(pond, layout.waterLevelY);
    if (geometry) builtGeometries.push(geometry);
  }
  if (builtGeometries.length === 0) return null;

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: WATER_SUN_DIRECTION.clone() },
      uShallow: { value: new THREE.Color(0.22, 0.46, 0.42) },
      uDeep: { value: new THREE.Color(0.05, 0.16, 0.2) },
      uSky: { value: new THREE.Color(0.7, 0.82, 0.9) },
      uOpacity: { value: 0.78 },
      uWaterCenter: { value: new THREE.Vector2(layout.centerX, layout.centerZ) },
      uFadeStart: { value: layout.fadeStart },
      uFadeEnd: { value: layout.fadeEnd },
    },
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: true,
  });

  const group = new THREE.Group();
  group.name = 'WoodlandWater';
  group.userData.isViewerScenery = true;

  const geometries: THREE.BufferGeometry[] = [];
  for (const geometry of builtGeometries) {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -60;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.isViewerScenery = true;
    mesh.userData.selectable = false;
    group.add(mesh);
  }

  return {
    group,
    update: (elapsedSeconds: number) => {
      material.uniforms.uTime.value = elapsedSeconds;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      material.dispose();
    },
  };
}
