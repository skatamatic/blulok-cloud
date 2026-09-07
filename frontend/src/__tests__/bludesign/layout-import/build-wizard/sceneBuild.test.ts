/**
 * Tests for the Build-in-3D wizard scene assembly.
 */

import {
  buildFacilityData,
  computeLayoutWorldCenter,
} from '@/components/bludesign/layout-import/build-wizard/sceneBuild';
import { GridSize } from '@/components/bludesign/core/types';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

function unit(id: string, cx: number, cy: number, label?: string, rotationRad = 0): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { cx, cy, width: 100, height: 200 },
    rotationRad,
    labelConfidence: 1,
    detectionConfidence: 1,
    label,
  };
}

const MPP = 0.05; // meters per pixel
const IMG = { imageWidth: 4000, imageHeight: 3000 };

describe('buildFacilityData', () => {
  it('centers a single unit at the world origin', () => {
    const units = [unit('a', 100, 200, 'A1', 0.5)];
    const data = buildFacilityData({
      units,
      metersPerPixel: MPP,
      assetIdByUnitId: { a: 'asset-1' },
      bindingByUnitId: {},
      facility: null,
      sceneName: 'Test',
      ...IMG,
    });

    expect(data.version).toBe('2.0.0');
    expect(data.gridSize).toBe(GridSize.TINY);
    expect(data.placedObjects).toHaveLength(1);

    const obj = data.placedObjects[0];
    expect(obj.assetId).toBe('asset-1');
    expect(obj.exactMeshPos!.x).toBeCloseTo(0, 6);
    expect(obj.exactMeshPos!.z).toBeCloseTo(0, 6);
    expect(obj.rotation).toBeCloseTo(-0.5, 6);
    expect(obj.position!.x).toBeCloseTo(0, 6);
    expect(obj.position!.z).toBeCloseTo(0, 6);
    expect(obj.name).toBe('A1');
    expect(obj.binding).toBeUndefined();
    expect(data.camera?.target).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(data.camera?.mode).toBe('free');
  });

  it('centers multi-unit layouts on the origin using world bounds', () => {
    const units = [unit('a', 0, 0), unit('b', 200, 0)];
    const assetIdByUnitId = { a: 'asset-1', b: 'asset-1' };
    const center = computeLayoutWorldCenter(units, assetIdByUnitId, MPP);
    expect(center.x).toBeCloseTo(100 * MPP, 6);
    expect(center.z).toBeCloseTo(0, 6);

    const data = buildFacilityData({
      units,
      metersPerPixel: MPP,
      assetIdByUnitId,
      bindingByUnitId: {},
      facility: null,
      sceneName: 'Test',
      ...IMG,
    });

    expect(data.placedObjects).toHaveLength(2);
    const byId = Object.fromEntries(data.placedObjects.map((o) => [o.id, o]));
    expect(byId.a.exactMeshPos!.x).toBeCloseTo(-100 * MPP, 6);
    expect(byId.b.exactMeshPos!.x).toBeCloseTo(100 * MPP, 6);
    expect(byId.a.exactMeshPos!.z).toBeCloseTo(0, 6);
    expect(byId.b.exactMeshPos!.z).toBeCloseTo(0, 6);
    expect(data.camera?.target).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(data.camera?.mode).toBe('free');
  });

  it('binds matched units and sets the data source', () => {
    const units = [unit('a', 10, 20, 'A1')];
    const data = buildFacilityData({
      units,
      metersPerPixel: MPP,
      assetIdByUnitId: { a: 'asset-1' },
      bindingByUnitId: { a: 'real-unit-1' },
      facility: { id: 'fac-1', name: 'North Site' },
      sceneName: 'North Site',
      ...IMG,
    });

    expect(data.placedObjects[0].binding).toEqual({ entityType: 'unit', entityId: 'real-unit-1' });
    expect(data.dataSource).toMatchObject({
      type: 'blulok',
      facilityId: 'fac-1',
      facilityName: 'North Site',
      autoConnect: true,
    });
  });

  it('skips units without an assigned asset', () => {
    const units = [unit('a', 10, 20), unit('b', 30, 40)];
    const data = buildFacilityData({
      units,
      metersPerPixel: MPP,
      assetIdByUnitId: { a: 'asset-1' },
      bindingByUnitId: {},
      facility: null,
      sceneName: 'Test',
      ...IMG,
    });
    expect(data.placedObjects).toHaveLength(1);
    expect(data.placedObjects[0].id).toBe('a');
    expect(data.dataSource).toBeUndefined();
  });

  it('embeds layoutImport metadata for 2D plan views', () => {
    const units = [unit('a', 10, 20, 'A1')];
    const data = buildFacilityData({
      units,
      metersPerPixel: MPP,
      assetIdByUnitId: { a: 'asset-1' },
      bindingByUnitId: {},
      facility: null,
      sceneName: 'Test',
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(data.layoutImport).toMatchObject({
      version: 1,
      metersPerPixel: MPP,
      imageWidth: 800,
      imageHeight: 600,
      sourceImageFile: 'layout-source.png',
    });
    expect(data.layoutImport?.units).toHaveLength(1);
    expect(data.layoutImport?.units[0]).toMatchObject({
      placedObjectId: 'a',
      label: 'A1',
    });
  });
});
