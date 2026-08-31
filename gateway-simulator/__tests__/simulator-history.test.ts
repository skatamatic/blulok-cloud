import { describe, expect, it } from 'vitest';
import { SimulatorHistory } from '../src/main/history/SimulatorHistory';
import type { SimulatorSnapshot } from '../src/main/history/simulator-history.types';
import { sampleProfile } from './helpers/mock-store';

function snapshot(overrides?: Partial<SimulatorSnapshot>): SimulatorSnapshot {
  return {
    profiles: [sampleProfile({ id: 'gw-1' })],
    userProfiles: [],
    activeInstanceId: 'gw-1',
    activeUserId: null,
    ...overrides,
  };
}

describe('SimulatorHistory', () => {
  it('pushes undo entries and clears redo on new action', () => {
    const history = new SimulatorHistory();
    history.push({ label: 'Add device', before: snapshot(), after: snapshot({ activeInstanceId: null }) });
    expect(history.getState().canUndo).toBe(true);

    history.push({ label: 'Remove device', before: snapshot({ activeInstanceId: null }), after: snapshot() });
    expect(history.getState().undoLabel).toBe('Remove device');
    expect(history.getState().canRedo).toBe(false);
  });

  it('coalesces consecutive updates with the same key', () => {
    const history = new SimulatorHistory();
    history.push({
      label: 'Update device',
      before: snapshot(),
      after: snapshot({ profiles: [sampleProfile({ id: 'gw-1', devices: [] })] }),
      coalesceKey: 'device:gw-1:lock:L1',
    });

    const coalesced = history.coalesceLatestAfter(
      snapshot({ profiles: [sampleProfile({ id: 'gw-1', devices: [{ kind: 'lock', lock_id: 'L2', online: true, locked: true }] })] }),
    );
    expect(coalesced).toBe(true);
    expect(history.peekUndo()?.after.profiles[0].devices).toHaveLength(1);
  });
});
