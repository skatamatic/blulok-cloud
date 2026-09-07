import {
  formatRecoveryInventoryPreviewIdentity,
  formatRecoveryInventoryPreviewLine,
} from '@/utils/gateway-recovery-inventory-preview.utils';

describe('gateway-recovery-inventory-preview.utils', () => {
  it('formats lock rows with lock_id like the snapshot payload', () => {
    expect(
      formatRecoveryInventoryPreviewLine({
        kind: 'lock',
        lock_id: '0961cd2f-f892-4a5e-921c-45abe91068d2',
      }),
    ).toBe('lock · lock_id: 0961cd2f-f892-4a5e-921c-45abe91068d2');
  });

  it('formats access_control with access_id and relay', () => {
    expect(
      formatRecoveryInventoryPreviewIdentity({
        kind: 'access_control',
        access_id: '5b679d67-b018-5bea-857a-8c8b1d1e7306',
        relay_channel: 1,
      }),
    ).toBe('access_id: 5b679d67-b018-5bea-857a-8c8b1d1e7306');
  });

  it('formats infra devices with serial', () => {
    expect(
      formatRecoveryInventoryPreviewLine({
        kind: 'bridge',
        serial: 'b17a62a3-8258-4a67-aa03-b0b0806b9cf2',
      }),
    ).toBe('bridge · serial: b17a62a3-8258-4a67-aa03-b0b0806b9cf2');
  });
});
