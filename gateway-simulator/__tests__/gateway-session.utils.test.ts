import { describe, expect, it } from 'vitest';
import {
  resolveGatewayBindingDisplay,
  sidebarStatusDotClass,
  sidebarShowsSwapIcon,
} from '../src/renderer/utils/gateway-session.utils';

describe('gateway-session.utils', () => {
  it('shows bound active session', () => {
    expect(resolveGatewayBindingDisplay('connected', 'active').tone).toBe('bound');
  });

  it('shows swap candidate session role', () => {
    expect(resolveGatewayBindingDisplay('connected', 'swap_candidate').tone).toBe('swap');
  });

  it('uses swap icon for swap candidate sidebar entries', () => {
    expect(sidebarShowsSwapIcon('connected', 'swap_candidate')).toBe(true);
    expect(sidebarShowsSwapIcon('connected', 'active')).toBe(false);
  });

  it('uses bound dot for connected active sessions', () => {
    expect(sidebarStatusDotClass('connected', 'active')).toBe('gateway-sidebar-status-dot-bound');
  });
});
