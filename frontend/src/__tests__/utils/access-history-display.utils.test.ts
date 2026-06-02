/**
 * @jest-environment jsdom
 */
import { AccessLog } from '@/types/access-history.types';
import {
  buildAccessLogDetailItems,
  getAccessLocationDisplay,
  getAccessUserDisplay,
  isNonUserAccessActor,
} from '@/utils/access-history-display.utils';

const baseLog: AccessLog = {
  id: 'log-1',
  device_id: 'dev-1',
  device_type: 'blulok',
  facility_id: 'fac-1',
  unit_id: 'unit-1',
  user_id: undefined,
  action: 'lock',
  method: 'automatic',
  success: true,
  occurred_at: '2026-06-01T10:00:00.000Z',
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-06-01T10:00:00.000Z',
  facility_name: 'Petrolia Storage Facility',
  unit_number: 'A-101',
  user_name: 'Gateway',
  actor_type: 'gateway',
  device_name: 'Lock GW-123',
  device_serial: 'GW-123',
  metadata: {
    actor: { type: 'gateway', name: 'Gateway' },
    facility: { id: 'fac-1', name: 'Petrolia Storage Facility', navigation_url: '/facilities/fac-1' },
    device: { id: 'dev-1', name: 'Lock GW-123', navigation_url: '/devices/blulok/dev-1' },
    description: 'Device was locked by Gateway',
  },
};

describe('access-history-display.utils', () => {
  it('does not show N/A secondary line for gateway actors', () => {
    const user = getAccessUserDisplay(baseLog);
    expect(user.primary).toBe('Gateway');
    expect(user.secondary).toBe('Facility gateway sync');
    expect(isNonUserAccessActor(baseLog)).toBe(true);
  });

  it('hides facility in location primary when facility scoped', () => {
    const scoped = getAccessLocationDisplay(baseLog, { hideFacility: true });
    expect(scoped.primary).toBe('Unit A-101');
    expect(scoped.showFacilityLink).toBe(false);

    const allFacilities = getAccessLocationDisplay(baseLog, { hideFacility: false });
    expect(allFacilities.primary).toBe('Petrolia Storage Facility');
    expect(allFacilities.secondary).toBe('Unit A-101');
  });

  it('falls back to device label when unit is missing', () => {
    const log: AccessLog = {
      ...baseLog,
      unit_id: undefined,
      unit_number: undefined,
      metadata: {
        actor: { type: 'gateway', name: 'Gateway' },
        device: { id: 'dev-1', name: 'Lock GW-123', navigation_url: '/devices/blulok/dev-1' },
      },
    };
    const scoped = getAccessLocationDisplay(log, { hideFacility: true });
    expect(scoped.primary).toBe('Lock GW-123');
  });

  it('builds expanded detail items including description', () => {
    const items = buildAccessLogDetailItems(baseLog, true);
    expect(items.some((item) => item.label === 'Description')).toBe(true);
    expect(items.some((item) => item.label === 'Device')).toBe(true);
    expect(items.some((item) => item.label === 'Facility')).toBe(false);
  });
});
