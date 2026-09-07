import { describe, expect, it } from 'vitest';
import { ADDABLE_INVENTORY_KINDS } from '../src/protocol/device-kinds';
import {
  ADD_DEVICE_KIND_OPTIONS,
  getInventoryKindIconMeta,
  getDeviceKindIconMeta,
  resolveDeviceKindIcon,
} from '../src/renderer/utils/device-icon.utils';
import { LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline';

describe('device-icon.utils', () => {
  it('maps inventory kinds to frontend-aligned icon metadata', () => {
    expect(getInventoryKindIconMeta('lock').label).toBe('BluLok');
    expect(getInventoryKindIconMeta('access_control').label).toBe('Access control');
    expect(getInventoryKindIconMeta('bridge').label).toBe('Bridge');
    expect(getInventoryKindIconMeta('friend_node').label).toBe('Friend node');
  });

  it('uses blulok blue styling for locks and indigo for network infra', () => {
    expect(getInventoryKindIconMeta('lock').containerClass).toContain('blue');
    expect(getInventoryKindIconMeta('bridge').containerClass).toContain('indigo');
    expect(getInventoryKindIconMeta('friend_node').containerClass).toContain('indigo');
  });

  it('exposes add options for every addable inventory kind', () => {
    expect(ADD_DEVICE_KIND_OPTIONS.map((option) => option.kind)).toEqual(ADDABLE_INVENTORY_KINDS);
    expect(ADD_DEVICE_KIND_OPTIONS.every((option) => option.description.length > 0)).toBe(true);
  });

  it('resolves gateway self rows with dedicated icon metadata', () => {
    expect(getDeviceKindIconMeta('gateway').label).toBe('Gateway');
  });

  it('uses open padlock for unlocked BluLok rows', () => {
    expect(resolveDeviceKindIcon('lock', { lockOpen: false })).toBe(LockClosedIcon);
    expect(resolveDeviceKindIcon('lock', { lockOpen: true })).toBe(LockOpenIcon);
    expect(resolveDeviceKindIcon('access_control', { lockOpen: true })).not.toBe(LockOpenIcon);
  });
});
