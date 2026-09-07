/**
 * Clipboard copy selection → objects/buildings (pure).
 */

import { resolveClipboardCopyContents } from '../../../../components/bludesign/core/clipboard/resolveClipboardCopyContents';
import { Orientation, type Building, type PlacedObject } from '../../../../components/bludesign/core/types';

function po(
  id: string,
  pos: { x: number; z: number },
  opts: { buildingId?: string } = {}
): PlacedObject {
  return {
    id,
    assetId: 'a',
    assetMetadata: {} as PlacedObject['assetMetadata'],
    position: { x: pos.x, z: pos.z, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    buildingId: opts.buildingId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function building(id: string): Building {
  return {
    id,
    name: 'B',
    footprints: [],
    floors: [],
    walls: [],
    interiorWalls: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('resolveClipboardCopyContents', () => {
  it('returns empty when selectedIds is empty', () => {
    const r = resolveClipboardCopyContents({
      selectedIds: [],
      selectedBuildingId: undefined,
      getBuilding: () => undefined,
      getBuildingCells: () => new Set(),
      getAllPlacedObjects: () => [],
      getObjectData: () => undefined,
    });
    expect(r.objects).toEqual([]);
    expect(r.buildings).toEqual([]);
  });

  it('collects objects by selected ids when no building selection', () => {
    const o1 = po('1', { x: 1, z: 2 });
    const o2 = po('2', { x: 3, z: 4 });
    const r = resolveClipboardCopyContents({
      selectedIds: ['1', '2'],
      selectedBuildingId: undefined,
      getBuilding: () => undefined,
      getBuildingCells: () => new Set(),
      getAllPlacedObjects: () => [o1, o2],
      getObjectData: (id) => (id === '1' ? o1 : id === '2' ? o2 : undefined),
    });
    expect(r.objects).toEqual([o1, o2]);
    expect(r.buildings).toEqual([]);
  });

  it('skips missing getObjectData entries', () => {
    const o1 = po('1', { x: 0, z: 0 });
    const r = resolveClipboardCopyContents({
      selectedIds: ['1', 'missing'],
      selectedBuildingId: undefined,
      getBuilding: () => undefined,
      getBuildingCells: () => new Set(),
      getAllPlacedObjects: () => [o1],
      getObjectData: (id) => (id === '1' ? o1 : undefined),
    });
    expect(r.objects).toEqual([o1]);
  });

  it('when a building is selected, includes building and objects in cells', () => {
    const b = building('bid');
    const inside = po('in', { x: 2, z: 3 });
    const outside = po('out', { x: 9, z: 9 });
    const cells = new Set(['2,3']);

    const r = resolveClipboardCopyContents({
      selectedIds: ['wall-1'],
      selectedBuildingId: 'bid',
      getBuilding: (id) => (id === 'bid' ? b : undefined),
      getBuildingCells: () => cells,
      getAllPlacedObjects: () => [inside, outside],
      getObjectData: jest.fn(),
    });

    expect(r.buildings).toEqual([b]);
    expect(r.objects).toEqual([inside]);
    expect(r.objects).not.toContainEqual(outside);
  });

  it('includes objects matched by buildingId even off footprint cells', () => {
    const b = building('bid');
    const attached = po('att', { x: 50, z: 50 }, { buildingId: 'bid' });

    const r = resolveClipboardCopyContents({
      selectedIds: ['x'],
      selectedBuildingId: 'bid',
      getBuilding: () => b,
      getBuildingCells: () => new Set(),
      getAllPlacedObjects: () => [attached],
      getObjectData: jest.fn(),
    });

    expect(r.buildings).toEqual([b]);
    expect(r.objects).toEqual([attached]);
  });

  it('when selectedBuildingId is set but building missing, returns empty lists', () => {
    const r = resolveClipboardCopyContents({
      selectedIds: ['a'],
      selectedBuildingId: 'missing',
      getBuilding: () => undefined,
      getBuildingCells: () => new Set(),
      getAllPlacedObjects: () => [po('a', { x: 0, z: 0 })],
      getObjectData: (id) => po(id, { x: 0, z: 0 }),
    });
    expect(r.buildings).toEqual([]);
    expect(r.objects).toEqual([]);
  });
});
