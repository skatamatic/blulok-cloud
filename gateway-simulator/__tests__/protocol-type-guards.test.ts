import { describe, expect, it } from 'vitest';
import { isCommandType, COMMAND_TYPES } from '../src/protocol/commands';
import { isGatewayInventoryKind, GATEWAY_INVENTORY_KINDS, ADDABLE_INVENTORY_KINDS } from '../src/protocol/device-kinds';

describe('protocol type guards', () => {
  it('isCommandType validates known command literals', () => {
    expect(isCommandType('LOCK')).toBe(true);
    expect(isCommandType('NOT_A_COMMAND')).toBe(false);
    expect(COMMAND_TYPES.length).toBeGreaterThan(5);
  });

  it('isGatewayInventoryKind validates inventory kinds', () => {
    for (const kind of GATEWAY_INVENTORY_KINDS) {
      expect(isGatewayInventoryKind(kind)).toBe(true);
    }
    expect(isGatewayInventoryKind('unknown')).toBe(false);
    expect(ADDABLE_INVENTORY_KINDS).not.toContain('gateway');
  });
});
