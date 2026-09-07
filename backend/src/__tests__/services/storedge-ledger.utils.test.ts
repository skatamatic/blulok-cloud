import { unitIdsForStoredgeTenant } from '@/services/fms/storedge-ledger.utils';

describe('unitIdsForStoredgeTenant', () => {
  it('skips ledgers with a missing tenant or unit', () => {
    expect(
      unitIdsForStoredgeTenant(
        [
          { tenant: null, unit: { id: 'u1' } },
          { tenant: { id: 't1' }, unit: null },
          { tenant: { id: 't1' }, unit: { id: 'u2' } },
          { tenant: { id: 't2' }, unit: { id: 'u3' } },
        ],
        't1',
      ),
    ).toEqual(['u2']);
  });
});
