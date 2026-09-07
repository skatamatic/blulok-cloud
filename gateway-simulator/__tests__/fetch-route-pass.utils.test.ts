import { describe, expect, it } from 'vitest';
import {
  getFetchRoutePassDisabledReason,
  isFetchRoutePassDisabled,
} from '../src/renderer/utils/fetch-route-pass.utils';

const ready = {
  loggedIn: true,
  deviceRegistered: true,
  facilityId: 'fac-1',
  busy: false,
};

describe('fetch route pass disabled state', () => {
  it('is enabled when session, device, and facility are ready', () => {
    expect(getFetchRoutePassDisabledReason(ready)).toBeUndefined();
    expect(isFetchRoutePassDisabled(ready)).toBe(false);
  });

  it('requires a cached session', () => {
    expect(getFetchRoutePassDisabledReason({ ...ready, loggedIn: false })).toBe(
      'Refresh the user session first',
    );
  });

  it('requires a registered device key', () => {
    expect(getFetchRoutePassDisabledReason({ ...ready, deviceRegistered: false })).toBe(
      'Register the device key with the backend first',
    );
  });

  it('requires a facility from an imported gateway', () => {
    expect(getFetchRoutePassDisabledReason({ ...ready, facilityId: undefined })).toBe(
      'Add a gateway to select a facility',
    );
  });

  it('blocks while another action is running', () => {
    expect(getFetchRoutePassDisabledReason({ ...ready, busy: true })).toBe(
      'Another action is in progress',
    );
  });
});
