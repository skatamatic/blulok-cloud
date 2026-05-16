import { registerBluDesignInputHandlers } from '../../../../components/bludesign/core/input/registerBluDesignInputHandlers';
import { EditorTool } from '../../../../components/bludesign/core/types';

describe('registerBluDesignInputHandlers', () => {
  it('registers four handlers on the coordinator', () => {
    const registerHandler = jest.fn();
    registerBluDesignInputHandlers({
      inputCoordinator: { registerHandler } as never,
      getActiveTool: () => EditorTool.PLACE,
      placementManager: {
        isActive: () => false,
        getInputHandlers: () => ({}),
      },
      selectionManager: {
        getEnabled: () => false,
        getInputHandlers: () => ({}),
      },
      cameraController: { setRotationEnabled: jest.fn() },
      translateGizmo: {
        isDraggingGizmo: () => false,
        isHovered: () => false,
      },
      rotateGizmo: {
        isDraggingGizmo: () => false,
        isGizmoHovered: () => false,
      },
    });
    expect(registerHandler).toHaveBeenCalledTimes(4);
    expect(registerHandler.mock.calls.map((c) => c[0].id)).toEqual([
      'gizmo',
      'placement',
      'selection',
      'camera',
    ]);
  });
});
