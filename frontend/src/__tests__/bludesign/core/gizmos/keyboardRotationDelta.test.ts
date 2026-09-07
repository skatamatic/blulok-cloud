import {
  ROTATION_ACCELERATION_MS,
  keyboardHeldRotationDeltaRadians,
} from '../../../../components/bludesign/core/gizmos/keyboardRotationDelta';

describe('keyboardHeldRotationDeltaRadians', () => {
  it('uses minimum degrees/sec when hold duration is zero', () => {
    const start = 10000;
    const delta = keyboardHeldRotationDeltaRadians(start, 1, start);
    expect(delta).toBeCloseTo(((5 / 60) * Math.PI) / 180, 10);
  });

  it('accelerates toward max speed after acceleration window', () => {
    const start = 0;
    const afterAccel = keyboardHeldRotationDeltaRadians(
      start,
      -1,
      start + ROTATION_ACCELERATION_MS + 100
    );
    const atStart = keyboardHeldRotationDeltaRadians(start, -1, start);
    expect(Math.abs(afterAccel)).toBeGreaterThan(Math.abs(atStart));
    expect(afterAccel).toBeLessThan(0);
  });

  it('flips sign with direction', () => {
    const t = 5000;
    const cw = keyboardHeldRotationDeltaRadians(0, 1, t);
    const ccw = keyboardHeldRotationDeltaRadians(0, -1, t);
    expect(cw).toBeCloseTo(-ccw, 10);
  });
});
