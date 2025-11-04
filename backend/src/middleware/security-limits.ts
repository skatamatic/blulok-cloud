import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '@/config/environment';

function isTestEnv(): boolean {
  return config.nodeEnv === 'test';
}

function userIpKeyGenerator(req: Request): string {
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown');
  const userId = (req as any).user?.userId;
  return userId ? `${userId}:${ip}` : ip;
}

function makeLimiter(windowMs: number, max: number) {
  if (isTestEnv()) {
    // No-op middleware in test to avoid flakiness
    return (_req: Request, _res: any, next: any) => next();
  }
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIpKeyGenerator,
    message: 'Too many requests, please try again later.',
  });
}

// Industry-leaning defaults
export const loginLimiter = makeLimiter(60_000, 5); // 5/min
export const passRequestLimiter = makeLimiter(60_000, 20); // 20/min
export const fallbackLimiter = makeLimiter(60_000, 6); // 6/min
export const adminWriteLimiter = makeLimiter(60_000, 60); // 60/min
export const publicLimiter = makeLimiter(60_000, 30); // 30/min
export const defaultLimiter = makeLimiter(60_000, 300); // 300/min


