import {
  AssetCategory,
  EditorTool,
  Orientation,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import { EditorRotationCoordinator } from '../../../../components/bludesign/core/gizmos/EditorRotationCoordinator';

function placed(
  id: string,
  overrides: Partial<PlacedObject> = {}
): PlacedObject {
  return {
    id,
    assetId: 'a',
    assetMetadata: {
      id: 'a',
      name: 'x',
      category: AssetCategory.DECORATION,
      dimensions: { width: 1, height: 1, depth: 1 },
      isSmart: false,
      canRotate: true,
      canStack: false,
      gridUnits: { x: 1, z: 1 },
    },
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    rotation: 0,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('EditorRotationCoordinator', () => {
  it('captureStartState skips floor tiles and walls', () => {
    const o1 = placed('obj1');
    const getObjectData = jest.fn((id: string) => {
      if (id === 'obj1') return o1;
      return undefined;
    });
    const c = new EditorRotationCoordinator({
      getSelectedIds: () => ['floor-tile-1', 'wall-x', 'obj1'],
      getActiveTool: () => EditorTool.SELECT,
      isPlacementActive: () => false,
      hasGridAlignment: () => false,
      applyFinePlacementRotationDelta: jest.fn(),
      rotateSelectionByAngle: jest.fn(),
      getObjectData,
      pushRotateHistory: jest.fn(),
    });
    c.captureStartState();
    c.recordToHistory();
    expect(getObjectData).toHaveBeenCalledWith('obj1');
    expect(getObjectData).not.toHaveBeenCalledWith('floor-tile-1');
  });

  it('recordToHistory calls pushRotateHistory when rotation changed', () => {
    const o = placed('a', { rotation: 0 });
    const getObjectData = jest.fn(() => o);
    const pushRotateHistory = jest.fn();

    const c = new EditorRotationCoordinator({
      getSelectedIds: () => ['a'],
      getActiveTool: () => EditorTool.SELECT,
      isPlacementActive: () => false,
      hasGridAlignment: () => false,
      applyFinePlacementRotationDelta: jest.fn(),
      rotateSelectionByAngle: jest.fn(),
      getObjectData,
      pushRotateHistory,
    });
    c.captureStartState();
    o.rotation = 0.5;
    c.recordToHistory();

    expect(pushRotateHistory).toHaveBeenCalledTimes(1);
  });

  it('recordToHistory does not push when nothing changed', () => {
    const o = placed('a');
    const pushRotateHistory = jest.fn();
    const c = new EditorRotationCoordinator({
      getSelectedIds: () => ['a'],
      getActiveTool: () => EditorTool.SELECT,
      isPlacementActive: () => false,
      hasGridAlignment: () => false,
      applyFinePlacementRotationDelta: jest.fn(),
      rotateSelectionByAngle: jest.fn(),
      getObjectData: () => o,
      pushRotateHistory,
    });
    c.captureStartState();
    c.recordToHistory();
    expect(pushRotateHistory).not.toHaveBeenCalled();
  });

  it('handleAltQHold uses fine placement when place tool active with empty selection', () => {
    const applyFine = jest.fn();
    const rotateSel = jest.fn();
    const c = new EditorRotationCoordinator({
      getSelectedIds: () => [],
      getActiveTool: () => EditorTool.PLACE,
      isPlacementActive: () => true,
      hasGridAlignment: () => false,
      applyFinePlacementRotationDelta: applyFine,
      rotateSelectionByAngle: rotateSel,
      getObjectData: jest.fn(),
      pushRotateHistory: jest.fn(),
      now: () => 10_000,
    });
    c.handleAltQHold(10_000);
    expect(applyFine).toHaveBeenCalled();
    expect(rotateSel).not.toHaveBeenCalled();
  });

  it('handleAltEHold rotates selection when not in fine-placement mode', () => {
    const rotateSel = jest.fn();
    const o = placed('x');
    const c = new EditorRotationCoordinator({
      getSelectedIds: () => ['x'],
      getActiveTool: () => EditorTool.SELECT,
      isPlacementActive: () => false,
      hasGridAlignment: () => false,
      applyFinePlacementRotationDelta: jest.fn(),
      rotateSelectionByAngle: rotateSel,
      getObjectData: (id) => (id === 'x' ? o : undefined),
      pushRotateHistory: jest.fn(),
      now: () => 10_000,
    });
    c.handleAltEHold(10_000);
    expect(rotateSel).toHaveBeenCalled();
  });

  it('onRotationKeyUp forwards to recordToHistory', () => {
    const pushRotateHistory = jest.fn();
    const o = placed('a', { rotation: 1 });
    const c = new EditorRotationCoordinator({
      getSelectedIds: () => ['a'],
      getActiveTool: () => EditorTool.SELECT,
      isPlacementActive: () => false,
      hasGridAlignment: () => false,
      applyFinePlacementRotationDelta: jest.fn(),
      rotateSelectionByAngle: jest.fn(),
      getObjectData: () => o,
      pushRotateHistory,
    });
    c.captureStartState();
    o.rotation = 2;
    c.onRotationKeyUp();
    expect(pushRotateHistory).toHaveBeenCalled();
  });
});
