import * as THREE from 'three';
import {
  AssetCategory,
  Orientation,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import { tryCommitPendingObjectMoves } from '../../../../components/bludesign/core/manipulation/pendingMove/commitPendingObjectMoves';
import type { PendingMoveOriginalSnapshot } from '../../../../components/bludesign/core/manipulation/pendingMove/pendingMoveBootstrap';

function po(overrides: Partial<PlacedObject> & { id: string }): PlacedObject {
  return {
    assetId: 'asset',
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: {
      id: 'asset',
      name: 'box',
      category: AssetCategory.DECORATION,
      dimensions: { width: 1, height: 1, depth: 1 },
      isSmart: false,
      canRotate: true,
      canStack: false,
      gridUnits: { x: 2, z: 1 },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('tryCommitPendingObjectMoves', () => {
  const grid = () => ({
    clearOccupied: jest.fn(),
    markOccupied: jest.fn(() => null),
  });

  it('returns ok:false without mutating when validation fails', () => {
    const o = po({ id: 'a', position: { x: 0, z: 0, y: 0 } });
    const before = { ...o.position };
    const originalPositions = new Map<string, PendingMoveOriginalSnapshot>([
      ['a', { position: { x: 0, z: 0, y: 0 }, orientation: Orientation.NORTH }],
    ]);
    const g = grid();

    const r = tryCommitPendingObjectMoves(
      {
        originalPositions,
        accumulatedDelta: { x: 1, z: 0 },
      },
      {
        getObjectData: (id) => (id === 'a' ? o : undefined),
        validateMove: () => false,
        gridSystem: g,
        now: () => 100,
      }
    );

    expect(r).toEqual({ ok: false });
    expect(o.position).toEqual(before);
    expect(g.clearOccupied).not.toHaveBeenCalled();
  });

  it('moves one object, updates grid, and records one history action', () => {
    const o = po({ id: 'a', position: { x: 0, z: 0, y: 0 } });
    const originalPositions = new Map<string, PendingMoveOriginalSnapshot>([
      ['a', { position: { x: 0, z: 0, y: 0 }, orientation: Orientation.NORTH }],
    ]);
    const g = grid();

    const r = tryCommitPendingObjectMoves(
      {
        originalPositions,
        accumulatedDelta: { x: 2, z: -1 },
      },
      {
        getObjectData: (id) => (id === 'a' ? o : undefined),
        validateMove: () => true,
        gridSystem: g,
        now: () => 200,
      }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moveActions).toHaveLength(1);
    expect(o.position).toEqual({ x: 2, z: -1, y: 0 });
    expect(g.clearOccupied).toHaveBeenCalledWith('a');
    expect(g.markOccupied).toHaveBeenCalledWith(
      'a',
      { x: 2, z: -1, y: 0 },
      { x: 2, z: 1 },
      false,
      AssetCategory.DECORATION,
      0
    );
    expect(r.moveActions[0].type).toBe('move');
    expect((r.moveActions[0].data as { toPosition: { x: number; z: number } }).toPosition).toEqual({
      x: 2,
      z: -1,
      y: 0,
    });
  });

  it('updates wall attachment for windows and emits no move actions', () => {
    const win = po({
      id: 'win1',
      assetMetadata: {
        id: 'w',
        name: 'w',
        category: AssetCategory.WINDOW,
        dimensions: { width: 1, height: 1, depth: 1 },
        isSmart: false,
        canRotate: false,
        canStack: false,
        gridUnits: { x: 1, z: 1 },
      },
      wallAttachment: { wallId: 'w1', position: 0.2 },
    });
    const originalPositions = new Map<string, PendingMoveOriginalSnapshot>([
      ['win1', { position: { x: 0, z: 0, y: 0 }, orientation: Orientation.NORTH }],
    ]);
    const windowDragData = new Map([
      [
        'win1',
        {
          wallId: 'w1',
          originalWallPosition: 0.2,
          currentWallPosition: 0.77,
          wallStart: new THREE.Vector3(0, 0, 0),
          wallEnd: new THREE.Vector3(5, 0, 0),
          wallDirection: new THREE.Vector3(1, 0, 0),
          wallLength: 5,
        },
      ],
    ]);
    const g = grid();

    const r = tryCommitPendingObjectMoves(
      { originalPositions, accumulatedDelta: { x: 0, z: 0 }, windowDragData },
      {
        getObjectData: (id) => (id === 'win1' ? win : undefined),
        validateMove: () => true,
        gridSystem: g,
      }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(win.wallAttachment!.position).toBe(0.77);
    expect(r.moveActions).toHaveLength(0);
    expect(g.clearOccupied).not.toHaveBeenCalled();
  });

  it('records batch-sized actions for two independent objects', () => {
    const a = po({ id: 'a', position: { x: 0, z: 0, y: 0 } });
    const b = po({ id: 'b', position: { x: 5, z: 0, y: 0 } });
    const originalPositions = new Map<string, PendingMoveOriginalSnapshot>([
      ['a', { position: { x: 0, z: 0, y: 0 }, orientation: Orientation.NORTH }],
      ['b', { position: { x: 5, z: 0, y: 0 }, orientation: Orientation.NORTH }],
    ]);
    const g = grid();
    const objects = { a, b };

    const r = tryCommitPendingObjectMoves(
      { originalPositions, accumulatedDelta: { x: 0, z: 1 } },
      {
        getObjectData: (id) => objects[id as 'a' | 'b'],
        validateMove: () => true,
        gridSystem: g,
        now: () => 300,
      }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moveActions).toHaveLength(2);
    expect(a.position.z).toBe(1);
    expect(b.position.z).toBe(1);
  });

  it('shifts exactMeshPos by the same grid delta as position', () => {
    const o = po({
      id: 'a',
      position: { x: 1, z: 2, y: 0 },
      exactMeshPos: { x: 10, z: 20 },
    });
    const originalPositions = new Map<string, PendingMoveOriginalSnapshot>([
      [
        'a',
        {
          position: { x: 1, z: 2, y: 0 },
          orientation: Orientation.NORTH,
          exactMeshPos: { x: 10, z: 20 },
        },
      ],
    ]);
    const g = grid();

    const r = tryCommitPendingObjectMoves(
      { originalPositions, accumulatedDelta: { x: 3, z: -2 } },
      {
        getObjectData: (id) => (id === 'a' ? o : undefined),
        validateMove: () => true,
        gridSystem: g,
        now: () => 400,
      }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(o.position).toEqual({ x: 4, z: 0, y: 0 });
    expect(o.exactMeshPos).toEqual({ x: 13, z: 18 });
    const data = r.moveActions[0].data as {
      fromExactMeshPos?: { x: number; z: number };
      toExactMeshPos?: { x: number; z: number };
    };
    expect(data.fromExactMeshPos).toEqual({ x: 10, z: 20 });
    expect(data.toExactMeshPos).toEqual({ x: 13, z: 18 });
  });

  it('returns ok with empty moveActions when original map yields no live objects', () => {
    const originalPositions = new Map<string, PendingMoveOriginalSnapshot>([
      ['ghost', { position: { x: 0, z: 0, y: 0 }, orientation: Orientation.NORTH }],
    ]);
    const r = tryCommitPendingObjectMoves(
      { originalPositions, accumulatedDelta: { x: 1, z: 0 } },
      {
        getObjectData: () => undefined,
        validateMove: () => true,
        gridSystem: grid(),
      }
    );
    expect(r).toEqual({ ok: true, moveActions: [] });
  });
});
