import { SystemSettingsModel } from '@/models/system-settings.model';
import type { NotificationsConfig } from '@/types/notification.types';
import { logger } from '@/utils/logger';
import { decryptSecret } from '@/utils/settings-secret.util';

const DEFAULT_CONFIG: NotificationsConfig = {
  enabledChannels: { sms: true, email: false },
  defaultProvider: { sms: 'console', email: 'console' },
  templates: {
    inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}',
    otpSms: 'Your verification code is: {{code}}',
  },
  deeplinkBaseUrl: 'blulok://',
};

/**
 * Loads and normalizes notifications.config from system_settings.
 * Decrypts Twilio/SMTP secrets for runtime use.
 */
export class NotificationConfigService {
  private static instance: NotificationConfigService;
  private settingsModel = new SystemSettingsModel();

  public static getInstance(): NotificationConfigService {
    if (!NotificationConfigService.instance) {
      NotificationConfigService.instance = new NotificationConfigService();
    }
    return NotificationConfigService.instance;
  }

  public getDefaultConfig(): NotificationsConfig {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as NotificationsConfig;
  }

  public async loadConfig(): Promise<NotificationsConfig> {
    const raw = await this.settingsModel.get('notifications.config');
    if (!raw) return this.getDefaultConfig();
    let parsed: NotificationsConfig;
    try {
      parsed = JSON.parse(raw) as NotificationsConfig;
    } catch (e) {
      // Falling back here silently switches every channel to the console provider,
      // so make the reason obvious in logs.
      logger.error(
        'Notifications: stored notifications.config is not valid JSON; using defaults ' +
          '(all sends go to the console provider until this is re-saved)',
        e,
      );
      return this.getDefaultConfig();
    }
    return this.decryptSecretsInConfig(parsed);
  }

  /**
   * Resolve the deeplink base URL.
   * Prefers notifications.config.deeplinkBaseUrl; falls back to legacy
   * `notifications.deeplink_base` key for backwards compatibility.
   */
  public async resolveDeeplinkBase(): Promise<string> {
    const config = await this.loadConfig();
    if (config.deeplinkBaseUrl?.trim()) {
      return this.normalizeDeeplinkBase(config.deeplinkBaseUrl.trim());
    }
    const legacy = await this.settingsModel.get('notifications.deeplink_base');
    return this.normalizeDeeplinkBase(legacy?.trim() || 'blulok://');
  }

  public normalizeDeeplinkBase(base: string): string {
    let result = base || 'blulok://';
    if (result.match(/^https?:\/\//) && !result.endsWith('/')) {
      result = `${result}/`;
    }
    return result;
  }

  /**
   * A bad key or corrupt ciphertext blanks only that secret. The provider factory
   * then rejects the incomplete config with an actionable error, instead of the
   * whole config collapsing to defaults and quietly "sending" to the console.
   */
  private decryptOrBlank(value: string, label: string): string {
    try {
      return decryptSecret(value);
    } catch (e) {
      logger.error(
        `Notifications: failed to decrypt ${label}; check SETTINGS_ENCRYPTION_KEY and re-save the secret`,
        e,
      );
      return '';
    }
  }

  private decryptSecretsInConfig(config: NotificationsConfig): NotificationsConfig {
    const next = { ...config };
    if (next.twilio?.authToken) {
      next.twilio = {
        ...next.twilio,
        authToken: this.decryptOrBlank(next.twilio.authToken, 'Twilio auth token'),
      };
    }
    if (next.smtp?.password) {
      next.smtp = {
        ...next.smtp,
        password: this.decryptOrBlank(next.smtp.password, 'SMTP password'),
      };
    }
    return next;
  }
}
