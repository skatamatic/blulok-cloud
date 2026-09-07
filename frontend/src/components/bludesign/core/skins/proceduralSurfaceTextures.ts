/**
 * Procedurally generates tileable PBR detail textures (normal + roughness + faint
 * albedo) for skin {@link ProceduralSurfaceId} surfaces such as ribbed sheet-metal
 * roofs and roll-up doors. Generating these on the GPU-bound client (instead of
 * shipping binary image assets) keeps them crisp, seamless, resolution-independent
 * and theme-tintable, while still giving materials real relief instead of flat color.
 */

import * as THREE from 'three';
import type { ProceduralSurfaceId } from '../types';

export interface ProceduralSurfaceMaps {
  /** Subtle albedo modulation (multiplies the part color). Null keeps color pristine. */
  map: THREE.Texture | null;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const TEXTURE_SIZE = 256;

const cache = new Map<ProceduralSurfaceId, ProceduralSurfaceMaps | null>();

/** Deterministic per-pixel hash noise in [0, 1) (tiles cleanly at the canvas edge). */
function hashNoise(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smoothed value noise used for soft streaking/dirt. */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const n00 = hashNoise(xi, yi);
  const n10 = hashNoise(xi + 1, yi);
  const n01 = hashNoise(xi, yi + 1);
  const n11 = hashNoise(xi + 1, yi + 1);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

/**
 * Height field for a surface in normalized [0,1) UV space. Returns a value in
 * roughly [-1, 1]; periodic features use integer frequencies so the texture tiles.
 */
function surfaceHeight(id: ProceduralSurfaceId, u: number, v: number): number {
  switch (id) {
    case 'standing-seam-metal': {
      // Horizontal raised seams every 1/seams of the panel, with broad, gently
      // convex pans between them and faint vertical brushing.
      const seams = 7;
      const f = (v * seams) % 1;
      const d = Math.abs(f - 0.5);
      const seam = Math.exp(-(d * d) / (2 * 0.045 * 0.045)); // narrow ridge
      const pan = 0.12 * Math.cos((f - 0.5) * Math.PI); // subtle convexity
      const brush = 0.04 * (valueNoise(u * 90, v * 6) - 0.5);
      return seam + pan + brush;
    }
    case 'roll-up-door': {
      // Stacked horizontal slats: each slat convex, separated by a recessed groove.
      const slats = 11;
      const s = v * slats;
      const f = s % 1;
      const slat = -Math.cos(f * Math.PI * 2) * 0.5; // convex slat face
      const d = Math.abs(f - 0.5);
      const groove = -Math.exp(-(d * d) / (2 * 0.05 * 0.05)) * 0.7; // shadow line
      const grain = 0.03 * (valueNoise(u * 70, v * 30) - 0.5);
      return slat + groove + grain;
    }
    case 'corrugated-metal': {
      const waves = 16;
      const main = Math.sin(u * waves * Math.PI * 2) * 0.85;
      const grain = 0.05 * (valueNoise(u * 40, v * 40) - 0.5);
      return main + grain;
    }
    case 'painted-steel':
    default: {
      // Almost flat: gentle oil-canning undulation plus very fine tooth.
      const oilCan = 0.15 * Math.sin(u * 3 * Math.PI * 2) * Math.sin(v * 2 * Math.PI * 2);
      const tooth = 0.05 * (valueNoise(u * 120, v * 120) - 0.5);
      return oilCan + tooth;
    }
  }
}

function makeCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  return canvas;
}

function finalizeTexture(texture: THREE.Texture, srgb: boolean): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function buildMaps(id: ProceduralSurfaceId): ProceduralSurfaceMaps | null {
  const normalCanvas = makeCanvas();
  const roughCanvas = makeCanvas();
  const albedoCanvas = makeCanvas();
  if (!normalCanvas || !roughCanvas || !albedoCanvas) {
    return null;
  }

  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const albedoCtx = albedoCanvas.getContext('2d');
  if (!normalCtx || !roughCtx || !albedoCtx) {
    return null;
  }

  const normalData = normalCtx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const roughData = roughCtx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const albedoData = albedoCtx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);

  const step = 1 / TEXTURE_SIZE;
  const relief = id === 'painted-steel' ? 1.4 : 2.6;

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = x * step;
      const v = y * step;

      // Central-difference normal from the height field (wraps via modulo features).
      const hL = surfaceHeight(id, (u - step + 1) % 1, v);
      const hR = surfaceHeight(id, (u + step) % 1, v);
      const hD = surfaceHeight(id, u, (v - step + 1) % 1);
      const hU = surfaceHeight(id, u, (v + step) % 1);
      const dx = (hR - hL) * relief;
      const dy = (hU - hD) * relief;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx * inv;
      const ny = -dy * inv;
      const nz = inv;

      const idx = (y * TEXTURE_SIZE + x) * 4;
      normalData.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData.data[idx + 3] = 255;

      // Roughness: metal mostly smooth, slightly glossier on raised seams, with
      // faint vertical streaking. Painted steel stays a touch more matte.
      const h = surfaceHeight(id, u, v);
      const streak = valueNoise(u * 18, v * 4);
      const base = id === 'painted-steel' ? 0.62 : 0.42;
      let rough = base + streak * 0.12 - Math.max(0, h) * 0.18;
      rough = Math.min(1, Math.max(0.18, rough));
      const rByte = Math.round(rough * 255);
      roughData.data[idx] = rByte;
      roughData.data[idx + 1] = rByte;
      roughData.data[idx + 2] = rByte;
      roughData.data[idx + 3] = 255;

      // Albedo modulation: subtle dirt/streaks for metals, none for painted steel.
      let albedo = 1;
      if (id !== 'painted-steel') {
        const dirt = valueNoise(u * 12, v * 22);
        albedo = 0.9 + dirt * 0.1 - Math.max(0, -h) * 0.06;
        albedo = Math.min(1, Math.max(0.78, albedo));
      }
      const aByte = Math.round(albedo * 255);
      albedoData.data[idx] = aByte;
      albedoData.data[idx + 1] = aByte;
      albedoData.data[idx + 2] = aByte;
      albedoData.data[idx + 3] = 255;
    }
  }

  normalCtx.putImageData(normalData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);
  albedoCtx.putImageData(albedoData, 0, 0);

  const normalMap = finalizeTexture(new THREE.CanvasTexture(normalCanvas), false);
  const roughnessMap = finalizeTexture(new THREE.CanvasTexture(roughCanvas), false);
  const map =
    id === 'painted-steel'
      ? null
      : finalizeTexture(new THREE.CanvasTexture(albedoCanvas), true);

  return { map, normalMap, roughnessMap };
}

/**
 * Returns cached procedural maps for a surface id, or null when no DOM/canvas is
 * available (e.g. test/SSR environments) so callers can gracefully fall back.
 */
export function getProceduralSurfaceMaps(id: ProceduralSurfaceId): ProceduralSurfaceMaps | null {
  if (cache.has(id)) {
    return cache.get(id) ?? null;
  }
  const maps = buildMaps(id);
  cache.set(id, maps);
  return maps;
}

/** Dispose cached procedural textures (call on full teardown). */
export function disposeProceduralSurfaceTextures(): void {
  for (const maps of cache.values()) {
    maps?.map?.dispose();
    maps?.normalMap.dispose();
    maps?.roughnessMap.dispose();
  }
  cache.clear();
}
