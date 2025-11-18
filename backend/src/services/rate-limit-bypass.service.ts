import type { Request } from 'express';

interface BypassConfig {
  durationMs: number;
  ip?: string | null;
  reason?: string | null;
}

interface BypassState {
  enabled: boolean;
  expiresAt: number | null;
  ip: string | null;
  reason: string | null;
}

function normalizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  // Normalize IPv6-mapped IPv4 addresses ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

export class RateLimitBypassService {
  private static instance: RateLimitBypassService;

  private enabledUntil: number | null = null;
  private allowedIp: string | null = null;
  private reason: string | null = null;

  static getInstance(): RateLimitBypassService {
    if (!RateLimitBypassService.instance) {
      RateLimitBypassService.instance = new RateLimitBypassService();
    }
    return RateLimitBypassService.instance;
  }

  enable(config: BypassConfig): void {
    const duration = Math.max(config.durationMs, 0);
    this.enabledUntil = Date.now() + duration;
    this.allowedIp = normalizeIp(config.ip ?? null);
    this.reason = config.reason || null;
  }

  disable(): void {
    this.enabledUntil = null;
    this.allowedIp = null;
    this.reason = null;
  }

  shouldBypass(req: Request): boolean {
    if (!this.enabledUntil) return false;
    if (Date.now() > this.enabledUntil) {
      this.disable();
      return false;
    }
    const reqIp = normalizeIp(req.ip || req.socket?.remoteAddress || null);
    if (this.allowedIp && reqIp !== this.allowedIp) {
      return false;
    }
    return true;
  }

  getState(): BypassState {
    return {
      enabled: !!this.enabledUntil && Date.now() <= (this.enabledUntil ?? 0),
      expiresAt: this.enabledUntil,
      ip: this.allowedIp,
      reason: this.reason,
    };
  }
}


