import { getApiErrorMessage } from '@/utils/apiError.utils';

describe('getApiErrorMessage', () => {
  it('returns axios response message when present', () => {
    expect(
      getApiErrorMessage({ response: { data: { message: 'Device offline' } } })
    ).toBe('Device offline');
  });

  it('returns Error.message when no axios message', () => {
    expect(getApiErrorMessage(new Error('Network'))).toBe('Network');
  });

  it('returns fallback for unknown shapes', () => {
    expect(getApiErrorMessage(null, 'Fallback')).toBe('Fallback');
  });
});
