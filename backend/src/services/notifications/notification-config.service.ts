import { SystemSettingsModel } from '@/models/system-settings.model';
import type { NotificationsConfig } from '@/types/notification.types';
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
    try {
      const parsed = JSON.parse(raw) as NotificationsConfig;
      return this.decryptSecretsInConfig(parsed);
    } catch {
      return this.getDefaultConfig();
    }
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

  private decryptSecretsInConfig(config: NotificationsConfig): NotificationsConfig {
    const next = { ...config };
    if (next.twilio?.authToken) {
      next.twilio = {
        ...next.twilio,
        authToken: decryptSecret(next.twilio.authToken),
      };
    }
    if (next.smtp?.password) {
      next.smtp = {
        ...next.smtp,
        password: decryptSecret(next.smtp.password),
      };
    }
    return next;
  }
}
