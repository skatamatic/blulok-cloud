import type { SmsProvider } from './provider.types';

export class TwilioSmsProvider implements SmsProvider {
  private client: any;
  private from: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
      this.from = fromNumber;
    } catch (_e) {
      throw new Error('Twilio SDK not installed. Please add dependency if using Twilio.');
    }
  }

  async sendSms(to: string, body: string): Promise<void> {
    await this.client.messages.create({ from: this.from, to, body });
  }
}
