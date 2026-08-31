import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/renderer/utils/error-message.utils';

describe('errorMessage', () => {
  it('returns Error message', () => {
    expect(errorMessage(new Error('auth failed'))).toBe('auth failed');
  });

  it('returns string errors as-is', () => {
    expect(errorMessage('network down')).toBe('network down');
  });

  it('falls back for unknown values', () => {
    expect(errorMessage({ code: 1 })).toBe('Something went wrong');
  });
});
