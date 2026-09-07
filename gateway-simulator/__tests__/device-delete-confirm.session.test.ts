import { describe, expect, it } from 'vitest';
import {
  resetDeviceDeleteConfirmSession,
  setSkipDeviceDeleteConfirmForSession,
  shouldConfirmDeviceDelete,
} from '../src/renderer/utils/device-delete-confirm.session';

describe('device-delete-confirm.session', () => {
  it('requires confirmation by default', () => {
    resetDeviceDeleteConfirmSession();
    expect(shouldConfirmDeviceDelete()).toBe(true);
  });

  it('skips confirmation for the session when opted out', () => {
    resetDeviceDeleteConfirmSession();
    setSkipDeviceDeleteConfirmForSession(true);
    expect(shouldConfirmDeviceDelete()).toBe(false);
  });

  it('resets when the session helper is cleared', () => {
    setSkipDeviceDeleteConfirmForSession(true);
    resetDeviceDeleteConfirmSession();
    expect(shouldConfirmDeviceDelete()).toBe(true);
  });
});
