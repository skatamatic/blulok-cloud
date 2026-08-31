import type { Response } from 'supertest';

/** Assert response status is allowed and body has basic API envelope when successful. */
export function expectMockDbContractResponse(
  response: Response,
  allowed: number[] = [200, 400, 403, 404, 500],
): void {
  expect(allowed).toContain(response.status);
  if (response.status === 200 && response.body && typeof response.body === 'object') {
    expect(response.body).toHaveProperty('success');
    expect(typeof response.body.success).toBe('boolean');
  }
}
