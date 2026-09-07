import { logger } from '@/utils/logger';

export type NotificationDebugEvent = {
  kind: 'invite' | 'otp' | 'password_reset';
  delivery: 'sms' | 'email';
  toPhone?: string;
  toEmail?: string;
  body: string;
  meta?: Record<string, any>;
  createdAt: Date;
};

/**
 * NotificationDebugService
 *
 * Lightweight, in-memory dev/test harness for notifications. When enabled,
 * NotificationService will publish invite/OTP payloads here instead of
 * calling real providers (e.g. Twilio). WebSocket subscribers can consume
 * these events for E2E tests and diagnostics.
 */
export class NotificationDebugService {
  private static instance: NotificationDebugService;
  private enabled = false;
  private listeners: Set<(event: NotificationDebugEvent) => void> = new Set();

  public static getInstance(): NotificationDebugService {
    if (!NotificationDebugService.instance) {
      NotificationDebugService.instance = new NotificationDebugService();
    }
    return NotificationDebugService.instance;
  }

  public enable(): void {
    this.enabled = true;
    logger.info('Notifications debug test mode ENABLED');
  }

  public disable(): void {
    this.enabled = false;
    logger.info('Notifications debug test mode DISABLED');
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Subscribe to debug events. Returns an unsubscribe function.
   */
  public subscribe(handler: (event: NotificationDebugEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public publish(event: NotificationDebugEvent): void {
    if (!this.enabled) return;
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch (_e) {
        // Swallow subscriber errors to avoid breaking publisher
      }
    }
  }
}


