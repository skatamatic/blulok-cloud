import { EditorGizmoController } from '../../../../components/bludesign/core/gizmos/EditorGizmoController';
import { Orientation } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';

describe('EditorGizmoController', () => {
  function makeGizmos() {
    const translateGizmo = {
      hide: jest.fn(),
      show: jest.fn(),
      setPosition: jest.fn(),
      setPositionFromGrid: jest.fn(),
      isDraggingGizmo: jest.fn(() => false),
      isHovered: jest.fn(() => false),
    };
    const rotateGizmo = {
      hide: jest.fn(),
      show: jest.fn(),
      setPosition: jest.fn(),
      isDraggingGizmo: jest.fn(() => false),
      isGizmoHovered: jest.fn(() => false),
    };
    return { translateGizmo, rotateGizmo };
  }

  function po(id: string): PlacedObject {
    return {
      id,
      assetId: 'a',
      position: { x: 0, z: 0, y: 0 },
      orientation: Orientation.NORTH,
      canStack: false,
      floor: 0,
      properties: {},
      assetMetadata: {} as PlacedObject['assetMetadata'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('hides both gizmos when readonly', () => {
    const { translateGizmo, rotateGizmo } = makeGizmos();
    const c = new EditorGizmoController(translateGizmo as never, rotateGizmo as never, {
      isReadonly: () => true,
      getSelectedIds: () => ['a'],
      getFloorY: () => 0,
      getSelectionGridCenter: () => ({ x: 0, z: 0 }),
      getSelectionGizmoPivotXZ: () => ({ x: 1, z: 1 }),
      getFirstSelectedPlacedObject: () => po('a'),
    });
    c.updateVisibility();
    expect(translateGizmo.hide).toHaveBeenCalled();
    expect(rotateGizmo.hide).toHaveBeenCalled();
  });

  it('shows translate gizmo in translate mode', () => {
    const { translateGizmo, rotateGizmo } = makeGizmos();
    const c = new EditorGizmoController(translateGizmo as never, rotateGizmo as never, {
      isReadonly: () => false,
      getSelectedIds: () => ['a'],
      getFloorY: () => 0.5,
      getSelectionGridCenter: () => ({ x: 2, z: 3 }),
      getSelectionGizmoPivotXZ: () => ({ x: 10, z: 30 }),
      getFirstSelectedPlacedObject: () => po('a'),
    });
    c.gizmoMode = 'translate';
    c.updateVisibility();
    expect(rotateGizmo.hide).toHaveBeenCalled();
    expect(translateGizmo.show).toHaveBeenCalledWith({ x: 10, z: 30 }, 0.5);
  });

  it('shows rotate gizmo in rotate mode', () => {
    const { translateGizmo, rotateGizmo } = makeGizmos();
    const c = new EditorGizmoController(translateGizmo as never, rotateGizmo as never, {
      isReadonly: () => false,
      getSelectedIds: () => ['a'],
      getFloorY: () => 1,
      getSelectionGridCenter: () => ({ x: 0, z: 0 }),
      getSelectionGizmoPivotXZ: () => ({ x: 5, z: 5 }),
      getFirstSelectedPlacedObject: () => ({ ...po('a'), rotation: 0.25 }),
    });
    c.gizmoMode = 'rotate';
    c.updateVisibility();
    expect(translateGizmo.hide).toHaveBeenCalled();
    expect(rotateGizmo.show).toHaveBeenCalledWith({ x: 5, z: 5 }, 1, 0.25);
  });

  it('onAltPressed switches to rotate mode', () => {
    const { translateGizmo, rotateGizmo } = makeGizmos();
    const c = new EditorGizmoController(translateGizmo as never, rotateGizmo as never, {
      isReadonly: () => false,
      getSelectedIds: () => ['a'],
      getFloorY: () => 0,
      getSelectionGridCenter: () => ({ x: 0, z: 0 }),
      getSelectionGizmoPivotXZ: () => ({ x: 0, z: 0 }),
      getFirstSelectedPlacedObject: () => po('a'),
    });
    c.onAltPressed();
    expect(c.gizmoMode).toBe('rotate');
  });

  it('setTranslatePositionForBuildingPreview delegates to translate gizmo', () => {
    const { translateGizmo, rotateGizmo } = makeGizmos();
    const c = new EditorGizmoController(translateGizmo as never, rotateGizmo as never, {
      isReadonly: () => false,
      getSelectedIds: () => [],
      getFloorY: () => 2,
      getSelectionGridCenter: () => null,
      getSelectionGizmoPivotXZ: () => null,
      getFirstSelectedPlacedObject: () => undefined,
    });
    c.setTranslatePositionForBuildingPreview({ x: 4, z: 5 });
    expect(translateGizmo.setPositionFromGrid).toHaveBeenCalledWith({ x: 4, z: 5 }, 2);
  });
});
