/**
 * Analytic CPU height sampling for the local terrain mesh.
 *
 * Mirrors the `localTerrainGround` vertex shader exactly so asset alignment matches
 * the rendered surface, without cloning/raycasting the displaced geometry.
 *
 * The terrain mesh only translates, rotates about Y, and scales with `scale.y === 1`,
 * so a vertex's world height is `mesh.position.y + vHeight`, independent of the XZ
 * transform. We invert the world matrix once to map a world XZ query into the unit
 * plane's UV space, then evaluate the same relief formula the shader uses.
 */

import * as THREE from 'three';
import { LOCAL_TERRAIN_SEGMENTS } from './localTerrainGround';

export function decodeRg8Normalized(r: number, g: number): number {
  return (r * 256 + g) / 65535;
}

type HeightmapPixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const heightmapPixelCache = new WeakMap<THREE.Texture, HeightmapPixels>();

function ensureHeightmapPixels(texture: THREE.Texture): HeightmapPixels | null {
  const cached = heightmapPixelCache.get(texture);
  if (cached) return cached;

  if (texture instanceof THREE.DataTexture) {
    const image = texture.image as { width: number; height: number; data: Uint8ClampedArray };
    if (image?.data && image.width > 0 && image.height > 0) {
      const pixels: HeightmapPixels = { width: image.width, height: image.height, data: image.data };
      heightmapPixelCache.set(texture, pixels);
      return pixels;
    }
    return null;
  }

  const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!image || !image.width || !image.height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels: HeightmapPixels = {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
  heightmapPixelCache.set(texture, pixels);
  return pixels;
}

const _local = new THREE.Vector3();

export class LocalTerrainHeightField {
  private pixels: HeightmapPixels | null = null;
  private readonly matrixWorldInverse = new THREE.Matrix4();
  private positionY = 0;
  private heightMin = 0;
  private heightMax = 0;
  private elevationAmplitude = 1;
  private segments = LOCAL_TERRAIN_SEGMENTS;
  private ready = false;

  /** Capture the terrain mesh transform + relief uniforms. Cheap; safe to call per refresh. */
  sync(mesh: THREE.Mesh | null): boolean {
    this.ready = false;
    if (!mesh) return false;

    const material = mesh.material;
    if (!(material instanceof THREE.ShaderMaterial)) return false;

    const heightmap = material.uniforms.uHeightmap?.value as THREE.Texture | null;
    if (!heightmap) return false;

    const pixels = ensureHeightmapPixels(heightmap);
    if (!pixels) return false;

    mesh.updateMatrixWorld(true);
    this.matrixWorldInverse.copy(mesh.matrixWorld).invert();
    this.positionY = mesh.position.y;
    this.heightMin = material.uniforms.uHeightMin.value as number;
    this.heightMax = material.uniforms.uHeightMax.value as number;
    this.elevationAmplitude = material.uniforms.uElevationAmplitude.value as number;

    const params = (mesh.geometry as THREE.PlaneGeometry).parameters;
    this.segments = params?.widthSegments ?? LOCAL_TERRAIN_SEGMENTS;

    this.pixels = pixels;
    this.ready = true;
    return true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Terrain mesh world Y offset (the constant added to every relief sample). */
  getMeshPositionY(): number {
    return this.positionY;
  }

  /** World-space terrain surface Y at (worldX, worldZ), or null when unavailable. */
  sampleWorldY(worldX: number, worldZ: number): number | null {
    if (!this.ready) return null;

    _local.set(worldX, 0, worldZ).applyMatrix4(this.matrixWorldInverse);
    // Unit plane spans [-0.5, 0.5]; PlaneGeometry.rotateX(-PI/2) gives v = 0.5 - localZ.
    const u = _local.x + 0.5;
    const v = 0.5 - _local.z;
    const relief = this.sampleReliefGrid(u, v);
    return this.positionY + relief * this.elevationAmplitude;
  }

  dispose(): void {
    this.pixels = null;
    this.ready = false;
  }

  /**
   * Relief in meters, reproducing the rendered surface: heights are defined only at the
   * mesh grid vertices (each a bilinear heightmap fetch), interpolated across the cell.
   */
  private sampleReliefGrid(u: number, v: number): number {
    const n = this.segments;
    const gu = THREE.MathUtils.clamp(u, 0, 1) * n;
    const gv = THREE.MathUtils.clamp(v, 0, 1) * n;

    const iu0 = Math.floor(gu);
    const iv0 = Math.floor(gv);
    const iu1 = Math.min(iu0 + 1, n);
    const iv1 = Math.min(iv0 + 1, n);
    const fu = gu - iu0;
    const fv = gv - iv0;

    const h00 = this.gridVertexRelief(iu0, iv0, n);
    const h10 = this.gridVertexRelief(iu1, iv0, n);
    const h01 = this.gridVertexRelief(iu0, iv1, n);
    const h11 = this.gridVertexRelief(iu1, iv1, n);

    const top = THREE.MathUtils.lerp(h00, h10, fu);
    const bottom = THREE.MathUtils.lerp(h01, h11, fu);
    return THREE.MathUtils.lerp(top, bottom, fv);
  }

  private gridVertexRelief(iu: number, iv: number, n: number): number {
    const gray = this.sampleHeightmapBilinear(iu / n, iv / n);
    return (this.heightMax - this.heightMin) * gray;
  }

  private sampleHeightmapBilinear(u: number, v: number): number {
    const map = this.pixels;
    if (!map) return 0;

    const x = THREE.MathUtils.clamp(u, 0, 1) * (map.width - 1);
    const y = THREE.MathUtils.clamp(v, 0, 1) * (map.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, map.width - 1);
    const y1 = Math.min(y0 + 1, map.height - 1);
    const tx = x - x0;
    const ty = y - y0;

    const read = (px: number, py: number) => {
      const idx = (py * map.width + px) * 4;
      return decodeRg8Normalized(map.data[idx], map.data[idx + 1]);
    };

    const top = THREE.MathUtils.lerp(read(x0, y0), read(x1, y0), tx);
    const bottom = THREE.MathUtils.lerp(read(x0, y1), read(x1, y1), tx);
    return THREE.MathUtils.lerp(top, bottom, ty);
  }
}

/** Best-fit upward normal of up to four terrain sample points (averaged diagonals). */
export function computeTerrainPlaneNormal(points: THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  if (points.length < 3) return normal.set(0, 1, 0);

  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3] ?? p2;

  const e10 = new THREE.Vector3().subVectors(p1, p0);
  const e30 = new THREE.Vector3().subVectors(p3, p0);
  const n1 = new THREE.Vector3().crossVectors(e10, e30);

  const e21 = new THREE.Vector3().subVectors(p2, p1);
  const e01 = new THREE.Vector3().subVectors(p0, p1);
  const n2 = new THREE.Vector3().crossVectors(e21, e01);

  normal.addVectors(n1, n2);
  if (normal.lengthSq() < 1e-8) {
    normal.crossVectors(e10, new THREE.Vector3().subVectors(p2, p0));
  }
  normal.normalize();
  if (normal.y < 0) normal.negate();
  return normal;
}
