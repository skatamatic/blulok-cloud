import * as THREE from 'three';
import { CameraController } from '../../../components/bludesign/core/CameraController';
import { CameraMode, IsometricAngle } from '../../../components/bludesign/core/types';

jest.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: jest.fn().mockImplementation(() => ({
    enableDamping: true,
    dampingFactor: 0.05,
    screenSpacePanning: true,
    minDistance: 5,
    maxDistance: 500,
    maxPolarAngle: Math.PI / 2,
    target: new THREE.Vector3(),
    mouseButtons: {},
    update: jest.fn(),
  })),
}));

function createController(): CameraController {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });

  return new CameraController(
    container,
    {
      mode: CameraMode.FREE,
      isometricAngle: IsometricAngle.NORTH_EAST,
      position: new THREE.Vector3(0, 20, 40),
      target: new THREE.Vector3(0, 0, 0),
      zoom: 1,
    },
    jest.fn()
  );
}

function walkKeys(controller: CameraController) {
  return (controller as unknown as { walkKeys: Record<string, boolean> }).walkKeys;
}

describe('CameraController walk keys', () => {
  it('ignores WASD and Z when Ctrl/Cmd is held', () => {
    const controller = createController();
    const keys = walkKeys(controller);

    for (const key of ['w', 'a', 's', 'd', 'z'] as const) {
      controller.handleWalkKeyEvent(
        new KeyboardEvent('keydown', { key, ctrlKey: true }),
        true
      );
    }

    expect(keys.forward).toBe(false);
    expect(keys.left).toBe(false);
    expect(keys.back).toBe(false);
    expect(keys.right).toBe(false);
    expect(keys.down).toBe(false);
  });

  it('still tracks plain S for backward walk', () => {
    const controller = createController();
    const keys = walkKeys(controller);

    controller.handleWalkKeyEvent(new KeyboardEvent('keydown', { key: 's' }), true);

    expect(keys.back).toBe(true);
  });
});
