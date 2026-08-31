import { describe, expect, it } from 'vitest';
import { extractErrorMessage, unwrapEnvelope } from '../src/main/auth/backend-http.utils';

describe('backend-http.utils', () => {
  it('extractErrorMessage prefers message, error, errors array, then fallback', () => {
    expect(extractErrorMessage({ message: 'Bad request' }, 400)).toBe('Bad request');
    expect(extractErrorMessage({ error: 'Unauthorized' }, 401)).toBe('Unauthorized');
    expect(extractErrorMessage({ errors: ['a', 'b'] }, 422)).toBe('a; b');
    expect(extractErrorMessage({}, 500)).toBe('Request failed (500)');
    expect(
      extractErrorMessage(
        { raw: '<html>Cannot POST /api/v1/dev/simulator/user-session</html>' },
        404,
      ),
    ).toMatch(/route not found.*simulator\/user-session/i);
  });

  it('unwrapEnvelope returns data wrapper when present', () => {
    expect(unwrapEnvelope<{ token: string }>({ data: { token: 'abc' } })).toEqual({ token: 'abc' });
    expect(unwrapEnvelope<{ token: string }>({ token: 'direct' })).toEqual({ token: 'direct' });
  });
});
