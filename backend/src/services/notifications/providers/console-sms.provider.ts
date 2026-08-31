import type { SmsProvider } from './provider.types';

export class ConsoleSmsProvider implements SmsProvider {
  async sendSms(to: string, body: string): Promise<void> {
    console.log(`[ConsoleSMS] -> ${to}: ${body}`);
  }
}
