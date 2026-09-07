import { FMSSyncInProgressError, isFMSSyncInProgressError } from '@/utils/fms-sync.utils';

describe('fms-sync.utils', () => {
  it('detects FMSSyncInProgressError instances', () => {
    expect(isFMSSyncInProgressError(new FMSSyncInProgressError())).toBe(true);
  });

  it('detects axios 409 conflict responses', () => {
    expect(
      isFMSSyncInProgressError({
        response: { status: 409, data: { message: 'already running' } },
      }),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isFMSSyncInProgressError(new Error('network'))).toBe(false);
    expect(isFMSSyncInProgressError({ response: { status: 500 } })).toBe(false);
  });
});
