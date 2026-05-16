/**
 * Facility import orchestration — call order and legacy vs serialized paths.
 */

import { runFacilitySceneImport } from '../../../../components/bludesign/core/import/facilitySceneImport';
import type { FacilitySceneImportServices } from '../../../../components/bludesign/core/import/facilitySceneImport';
import { CameraMode, GridSize, IsometricAngle } from '../../../../components/bludesign/core/types';
import type { CameraState } from '../../../../components/bludesign/core/types';
import type { FacilityData, LegacyFacilityData } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';
import type { SerializedPlacedObject } from '../../../../components/bludesign/core/types';

function baseV2(): FacilityData {
  const camera = {
    mode: CameraMode.ISOMETRIC,
    isometricAngle: IsometricAngle.NORTH_EAST,
    position: { x: 0, y: 10, z: 10 },
    target: { x: 0, y: 0, z: 0 },
    zoom: 1,
  } as unknown as CameraState;
  return {
    name: 'F',
    version: '2',
    camera,
    placedObjects: [],
    buildings: [],
    activeFloor: 0,
    activeSkins: {},
    gridSize: GridSize.SMALL,
    showGrid: true,
  };
}

describe('runFacilitySceneImport', () => {
  function mockServices(): FacilitySceneImportServices & { log: string[] } {
    const log: string[] = [];
    const s: FacilitySceneImportServices & { log: string[] } = {
      log,
      clearSceneForImport: () => log.push('clear'),
      resetWorkingGridAlignment: () => log.push('align'),
      restoreCamera: () => log.push('camera'),
      restoreBuilding: () => log.push('restoreBuilding'),
      registerFloorLevel: () => log.push('registerFloor'),
      setEditorFloorMode: () => log.push('floorMode'),
      placeObjectFromSavedData: () => log.push('legacyObj'),
      placeObjectFromSerialized: () => log.push('v2Obj'),
      syncActiveFloor: () => log.push('activeFloor'),
      loadLegacyFacilitySkins: () => log.push('legacySkins'),
      applyActiveSkinsRecord: () => log.push('activeSkins'),
      setSnapGridSize: () => log.push('gridSize'),
      optimizeGroundTilesAfterLoad: () => log.push('optimize'),
      setGridUiVisible: () => log.push('showGrid'),
      resolveAndApplyTheme: () => log.push('theme'),
      setDataSourceConfig: () => log.push('dataSource'),
      emitImportComplete: () => log.push('emit'),
    };
    return s;
  }

  it('runs core steps in order for an empty v2 facility', () => {
    const s = mockServices();
    runFacilitySceneImport(baseV2(), s);

    expect(s.log[0]).toBe('clear');
    expect(s.log[1]).toBe('align');
    expect(s.log[2]).toBe('camera');
    expect(s.log).toContain('optimize');
    expect(s.log).toContain('showGrid');
    expect(s.log[s.log.length - 1]).toBe('emit');
  });

  it('restores buildings, registers floors, and sets floor mode', () => {
    const s = mockServices();
    const data: FacilityData = {
      ...baseV2(),
      buildings: [
        {
          id: 'b1',
          name: 'B',
          footprints: [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }],
          floors: [
            { level: 0, height: 4 },
            { level: 1, height: 4 },
          ],
        },
      ],
    };

    runFacilitySceneImport(data, s);

    const idx = s.log.indexOf('restoreBuilding');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(s.log.filter((x) => x === 'registerFloor').length).toBe(2);
    expect(s.log).toContain('floorMode');
  });

  it('places legacy objects when legacy format', () => {
    const s = mockServices();
    const placed = { id: 'p1' } as PlacedObject;
    const legacy: LegacyFacilityData = {
      name: 'L',
      version: '1.0.0',
      camera: baseV2().camera,
      placedObjects: [placed],
      buildings: [],
      activeFloor: 0,
      gridSize: GridSize.SMALL,
      showGrid: true,
    };

    runFacilitySceneImport(legacy, s);

    expect(s.log).toContain('legacyObj');
    expect(s.log).not.toContain('v2Obj');
  });

  it('places serialized objects for v2', () => {
    const s = mockServices();
    const sp = { id: 's1', assetId: 'a1' } as SerializedPlacedObject;
    const data: FacilityData = {
      ...baseV2(),
      placedObjects: [sp],
    };

    runFacilitySceneImport(data, s);

    expect(s.log).toContain('v2Obj');
    expect(s.log).not.toContain('legacyObj');
  });

  it('applies theme when activeThemeId is set', () => {
    const s = mockServices();
    const data: FacilityData = { ...baseV2(), activeThemeId: 'theme-x' };
    runFacilitySceneImport(data, s);
    expect(s.log).toContain('theme');
  });
});
