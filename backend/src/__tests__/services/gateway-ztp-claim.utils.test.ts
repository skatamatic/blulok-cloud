import {
  getZtpIntendedFacilityId,
  withZtpIntendedFacilityId,
  withoutZtpIntendedFacilityId,
  ZTP_INTENDED_FACILITY_ID_KEY,
} from '@/utils/gateway-ztp-claim.utils';

describe('gateway-ztp-claim.utils', () => {
  it('reads intended facility from object or JSON metadata', () => {
    expect(getZtpIntendedFacilityId({ [ZTP_INTENDED_FACILITY_ID_KEY]: 'fac-1' })).toBe('fac-1');
    expect(
      getZtpIntendedFacilityId(JSON.stringify({ [ZTP_INTENDED_FACILITY_ID_KEY]: 'fac-2' })),
    ).toBe('fac-2');
    expect(getZtpIntendedFacilityId({})).toBeNull();
    expect(getZtpIntendedFacilityId(null)).toBeNull();
  });

  it('merges intended facility and provisionedVia into metadata', () => {
    const next = withZtpIntendedFacilityId({ existing: true }, 'fac-9');
    expect(next).toMatchObject({
      existing: true,
      provisionedVia: 'ztp_sticker',
      [ZTP_INTENDED_FACILITY_ID_KEY]: 'fac-9',
    });
  });

  it('clears intended facility for release/revoke', () => {
    const cleared = withoutZtpIntendedFacilityId({
      existing: true,
      [ZTP_INTENDED_FACILITY_ID_KEY]: 'fac-9',
    });
    expect(cleared.existing).toBe(true);
    expect(cleared[ZTP_INTENDED_FACILITY_ID_KEY]).toBeUndefined();
  });
});
