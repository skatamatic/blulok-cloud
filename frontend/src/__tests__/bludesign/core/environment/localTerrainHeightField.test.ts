import * as THREE from 'three';
import {
  LocalTerrainHeightField,
  computeTerrainPlaneNormal,
  decodeRg8Normalized,
} from '@/components/bludesign/core/environment/localTerrainHeightField';
import { createLocalTerrainMaterial } from '@/components/bludesign/core/environment/localTerrainGround';

/** RG8-encode a per-texel gray value (0..1) into an RGBA byte buffer. */
function encodeRg8(gray: number): [number, number] {
  const encoded = Math.round(THREE.MathUtils.clamp(gray, 0, 1) * 65535);
  return [Math.floor(encoded / 256), encoded % 256];
}

function makeHeightmapTexture(grays: number[][]): THREE.DataTexture {
  const height = grays.length;
  const width = grays[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g] = encodeRg8(grays[y][x]);
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function makeTerrainMesh(options: {
  grays: number[][];
  heightMin?: number;
  heightMax?: number;
  elevationAmplitude?: number;
  segments?: number;
  scale?: number;
  positionY?: number;
}): THREE.Mesh {
  const {
    grays,
    heightMin = 0,
    heightMax = 10,
    elevationAmplitude = 1,
    segments = 2,
    scale = 1,
    positionY = 0,
  } = options;

  const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const material = createLocalTerrainMaterial();
  material.uniforms.uHeightmap.value = makeHeightmapTexture(grays);
  material.uniforms.uHeightMin.value = heightMin;
  material.uniforms.uHeightMax.value = heightMax;
  material.uniforms.uElevationAmplitude.value = elevationAmplitude;
  material.uniforms.uMeshSize.value.set(1, 1);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale, 1, scale);
  mesh.position.y = positionY;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('decodeRg8Normalized', () => {
  it('decodes 16-bit RG8 height from two bytes', () => {
    expect(decodeRg8Normalized(0, 0)).toBe(0);
    expect(decodeRg8Normalized(255, 255)).toBeCloseTo(1, 5);
    expect(decodeRg8Normalized(128, 0)).toBeCloseTo((128 * 256) / 65535, 5);
  });
});

describe('LocalTerrainHeightField', () => {
  it('samples flat relief consistent with the shader formula', () => {
    const mesh = makeTerrainMesh({ grays: [[0.5]] });
    const field = new LocalTerrainHeightField();
    expect(field.sync(mesh)).toBe(true);
    // relief = (10 - 0) * 0.5 * amp(1) = 5 (sub-mm slack for 16-bit RG8 encoding)
    expect(field.sampleWorldY(0, 0)).toBeCloseTo(5, 3);
  });

  it('scales relief by the elevation amplitude uniform', () => {
    const mesh = makeTerrainMesh({ grays: [[0.5]], elevationAmplitude: 2 });
    const field = new LocalTerrainHeightField();
    field.sync(mesh);
    expect(field.sampleWorldY(0, 0)).toBeCloseTo(10, 3);
  });

  it('adds the mesh world Y offset to the relief', () => {
    const mesh = makeTerrainMesh({ grays: [[0.5]], positionY: 3 });
    const field = new LocalTerrainHeightField();
    field.sync(mesh);
    expect(field.sampleWorldY(0, 0)).toBeCloseTo(8, 3);
  });

  it('maps Z without mirroring (north corner is high, south is low)', () => {
    // 2x2 texel map: v=0 row low (0.0), v=1 row high (1.0).
    // Texture rows are indexed by v; heightmap v = 0.5 - localZ.
    const mesh = makeTerrainMesh({
      grays: [
        [0, 0],
        [1, 1],
      ],
      segments: 8,
      scale: 10,
    });
    const field = new LocalTerrainHeightField();
    field.sync(mesh);

    // localZ = -0.5 -> v = 1.0 (high row); world z = localZ * scale = -5
    const highSide = field.sampleWorldY(0, -4.9)!;
    // localZ = +0.5 -> v = 0.0 (low row); world z = +5
    const lowSide = field.sampleWorldY(0, 4.9)!;

    // Not mirrored: the high texture row (v=1) maps to -Z, the low row to +Z.
    expect(highSide).toBeGreaterThan(lowSide);
    expect(highSide).toBeGreaterThan(8);
    expect(lowSide).toBeLessThan(1);
  });

  it('returns null before sync', () => {
    const field = new LocalTerrainHeightField();
    expect(field.sampleWorldY(0, 0)).toBeNull();
  });
});

describe('computeTerrainPlaneNormal', () => {
  it('returns world up for flat samples', () => {
    const points = [
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(1, 2, 0),
      new THREE.Vector3(1, 2, 1),
      new THREE.Vector3(0, 2, 1),
    ];
    const normal = computeTerrainPlaneNormal(points);
    expect(normal.x).toBeCloseTo(0, 4);
    expect(normal.y).toBeCloseTo(1, 4);
    expect(normal.z).toBeCloseTo(0, 4);
  });

  it('tilts toward a sloped sample set with an upward normal', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(0, 0, 1),
    ];
    const normal = computeTerrainPlaneNormal(points);
    expect(normal.y).toBeGreaterThan(0);
    expect(normal.x).toBeLessThan(0);
  });
});
