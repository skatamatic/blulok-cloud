import {
  attachLayoutImportToFacilityData,
  buildLayoutImportMetadata,
  hasLayoutImport,
  isValidLayoutImport,
  LAYOUT_SOURCE_FILENAME,
  type LayoutImportMetadata,
} from '../../../components/bludesign/layout-import/layoutImportMetadata';
import type { FacilityData } from '../../../components/bludesign/core/types';
import { CameraMode, GridSize, IsometricAngle } from '../../../components/bludesign/core/types';
import * as THREE from 'three';

const sampleMeta: LayoutImportMetadata = {
  version: 1,
  metersPerPixel: 0.05,
  imageWidth: 800,
  imageHeight: 600,
  importedAt: '2026-01-01T00:00:00.000Z',
  sourceImageFile: LAYOUT_SOURCE_FILENAME,
  units: [
    {
      placedObjectId: 'u1',
      bounds: { cx: 10, cy: 20, width: 40, height: 30 },
      rotationRad: 0,
      label: '101',
    },
  ],
};

const baseFacility: FacilityData = {
  name: 'Test',
  version: '2.0.0',
  camera: {
    mode: CameraMode.FREE,
    isometricAngle: IsometricAngle.SOUTH_WEST,
    position: new THREE.Vector3(0, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
    zoom: 1,
  },
  placedObjects: [],
  buildings: [],
  activeFloor: 0,
  activeSkins: {},
  gridSize: GridSize.TINY,
  showGrid: true,
};

describe('isValidLayoutImport', () => {
  it('accepts well-formed metadata', () => {
    expect(isValidLayoutImport(sampleMeta)).toBe(true);
  });

  it('rejects missing or invalid fields', () => {
    expect(isValidLayoutImport(null)).toBe(false);
    expect(isValidLayoutImport({ ...sampleMeta, version: 2 })).toBe(false);
    expect(isValidLayoutImport({ ...sampleMeta, imageWidth: 0 })).toBe(false);
    expect(isValidLayoutImport({ ...sampleMeta, units: [] })).toBe(false);
    expect(isValidLayoutImport({ ...sampleMeta, sourceImageFile: 'other.png' })).toBe(false);
  });
});

describe('hasLayoutImport', () => {
  it('narrows when layoutImport is valid', () => {
    const data = { ...baseFacility, layoutImport: sampleMeta };
    expect(hasLayoutImport(data)).toBe(true);
    if (hasLayoutImport(data)) {
      expect(data.layoutImport.units).toHaveLength(1);
    }
  });

  it('returns false when metadata is absent or invalid', () => {
    expect(hasLayoutImport(baseFacility)).toBe(false);
    expect(hasLayoutImport({ ...baseFacility, layoutImport: { version: 1 } as never })).toBe(false);
  });
});

describe('attachLayoutImportToFacilityData', () => {
  it('merges valid metadata into save payload', () => {
    const out = attachLayoutImportToFacilityData(baseFacility, sampleMeta);
    expect(out.layoutImport).toEqual(sampleMeta);
  });

  it('leaves payload unchanged when metadata is null or invalid', () => {
    expect(attachLayoutImportToFacilityData(baseFacility, null)).toEqual(baseFacility);
    expect(attachLayoutImportToFacilityData(baseFacility, { version: 1 } as never)).toEqual(baseFacility);
  });
});

describe('buildLayoutImportMetadata', () => {
  it('maps editable units with asset bindings', () => {
    const meta = buildLayoutImportMetadata({
      metersPerPixel: 0.1,
      imageWidth: 100,
      imageHeight: 200,
      assetIdByUnitId: { a: 'asset-a', b: 'asset-b' },
      units: [
        {
          id: 'a',
          kind: 'unit',
          bounds: { cx: 1, cy: 2, width: 3, height: 4 },
          rotationRad: 0,
          label: 'A1',
          labelConfidence: 1,
          detectionConfidence: 1,
        },
        {
          id: 'b',
          kind: 'rectangle',
          bounds: { cx: 5, cy: 6, width: 7, height: 8 },
          rotationRad: 0.5,
          labelConfidence: 1,
          detectionConfidence: 1,
        },
        {
          id: 'c',
          kind: 'unit',
          bounds: { cx: 0, cy: 0, width: 1, height: 1 },
          rotationRad: 0,
          labelConfidence: 1,
          detectionConfidence: 1,
        },
      ],
    });

    expect(meta.version).toBe(1);
    expect(meta.sourceImageFile).toBe(LAYOUT_SOURCE_FILENAME);
    expect(meta.units).toHaveLength(2);
    expect(meta.units[0].placedObjectId).toBe('a');
    expect(meta.units[1].kind).toBe('rectangle');
  });
});
