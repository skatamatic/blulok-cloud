import type { Request } from 'express';
import { RateLimitBypassService } from '@/services/rate-limit-bypass.service';

function makeReq(partial: Partial<Request & { socket?: { remoteAddress?: string } }>): Request {
  return partial as Request;
}

describe('RateLimitBypassService', () => {
  beforeEach(() => {
    RateLimitBypassService.getInstance().disable();
    jest.useRealTimers();
  });

  it('returns false when bypass is disabled', () => {
    const svc = RateLimitBypassService.getInstance();
    svc.disable();
    expect(svc.shouldBypass(makeReq({ ip: '127.0.0.1' }))).toBe(false);
    expect(svc.getState().enabled).toBe(false);
  });

  it('allows all IPs when enabled without ip filter until expiry', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const svc = RateLimitBypassService.getInstance();
    svc.enable({ durationMs: 120_000 });

    expect(svc.getState().enabled).toBe(true);
    expect(svc.getState().expiresAt).toBe(Date.now() + 120_000);
    expect(svc.shouldBypass(makeReq({ ip: '127.0.0.1' }))).toBe(true);
    expect(svc.shouldBypass(makeReq({ ip: '10.0.0.5' }))).toBe(true);

    jest.advanceTimersByTime(120_001);
    expect(svc.shouldBypass(makeReq({ ip: '127.0.0.1' }))).toBe(false);
    expect(svc.getState().enabled).toBe(false);
  });

  it('allows only matching IP when ip filter is set', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const svc = RateLimitBypassService.getInstance();
    svc.enable({ durationMs: 60_000, ip: '10.0.0.2' });

    expect(svc.shouldBypass(makeReq({ ip: '10.0.0.2' }))).toBe(true);
    expect(svc.shouldBypass(makeReq({ ip: '10.0.0.5' }))).toBe(false);
  });

  it('normalizes IPv6-mapped IPv4 addresses for comparison', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const svc = RateLimitBypassService.getInstance();
    svc.enable({ durationMs: 60_000, ip: '127.0.0.1' });

    expect(svc.shouldBypass(makeReq({ ip: '::ffff:127.0.0.1' }))).toBe(true);
  });

  it('uses socket.remoteAddress when req.ip is missing', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const svc = RateLimitBypassService.getInstance();
    svc.enable({ durationMs: 60_000, ip: '192.168.1.10' });

    expect(
      svc.shouldBypass(
        makeReq({
          ip: undefined,
          socket: { remoteAddress: '192.168.1.10' } as any,
        })
      )
    ).toBe(true);
  });

  it('stores optional reason and clears it on disable', () => {
    const svc = RateLimitBypassService.getInstance();
    svc.enable({ durationMs: 10_000, reason: 'local e2e' });
    expect(svc.getState().reason).toBe('local e2e');

    svc.disable();
    expect(svc.getState().reason).toBeNull();
  });

  it('clamps negative duration to 0 (expires on next tick)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const svc = RateLimitBypassService.getInstance();
    svc.enable({ durationMs: -5_000 });

    expect(svc.getState().expiresAt).toBe(Date.now());
    jest.advanceTimersByTime(1);
    expect(svc.shouldBypass(makeReq({ ip: '127.0.0.1' }))).toBe(false);
  });
});
