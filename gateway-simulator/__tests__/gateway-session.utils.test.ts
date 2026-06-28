import { describe, expect, it } from 'vitest';
import {
  resolveGatewayBindingDisplay,
  sessionBadgeClassName,
  sessionPillClassName,
  sidebarShowsSwapIcon,
  sidebarStatusDotClass,
} from '../src/renderer/utils/gateway-session.utils';

describe('gateway-session.utils', () => {
  it('shows offline when disconnected', () => {
    const display = resolveGatewayBindingDisplay('disconnected');
    expect(display.label).toBe('Offline');
    expect(display.tone).toBe('offline');
  });

  it('shows connecting and error states', () => {
    expect(resolveGatewayBindingDisplay('connecting').tone).toBe('connecting');
    expect(resolveGatewayBindingDisplay('error').tone).toBe('error');
  });

  it('shows bound when connected as active production gateway', () => {
    const display = resolveGatewayBindingDisplay('connected', 'active');
    expect(display.label).toBe('Bound (production)');
    expect(display.tone).toBe('bound');
  });

  it('shows swap candidate and legacy session roles', () => {
    expect(resolveGatewayBindingDisplay('connected', 'swap_candidate').tone).toBe('swap');
    expect(resolveGatewayBindingDisplay('connected', 'legacy').tone).toBe('legacy');
    expect(resolveGatewayBindingDisplay('connected').tone).toBe('bound');
  });

  it('maps tones to badge and pill class names', () => {
    expect(sessionBadgeClassName('bound')).toContain('session-badge-bound');
    expect(sessionBadgeClassName('swap')).toContain('session-badge-swap');
    expect(sessionPillClassName('error')).toContain('status-pill-error');
  });

  it('uses swap icon for connected swap candidates in sidebar', () => {
    expect(sidebarShowsSwapIcon('connected', 'swap_candidate')).toBe(true);
    expect(sidebarShowsSwapIcon('connected', 'active')).toBe(false);
    expect(sidebarShowsSwapIcon('disconnected', 'swap_candidate')).toBe(false);
    expect(sidebarStatusDotClass('connected', 'active')).toBe('gateway-sidebar-status-dot-bound');
    expect(sidebarStatusDotClass('connected', 'legacy')).toBe('gateway-sidebar-status-dot-legacy');
    expect(sidebarStatusDotClass('connecting', 'active')).toBe('gateway-sidebar-status-dot-connecting');
    expect(sidebarStatusDotClass('error', 'active')).toBe('gateway-sidebar-status-dot-error');
    expect(sidebarStatusDotClass('disconnected', 'swap_candidate')).toBe('gateway-sidebar-status-dot-offline');
  });
});
