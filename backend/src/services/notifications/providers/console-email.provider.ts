import type { EmailProvider } from './provider.types';

export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, html: string, _text?: string): Promise<void> {
    console.log(`[ConsoleEmail] -> ${to}: ${subject} | ${html}`);
  }

  async verifyConnection(): Promise<void> {
    // Console provider always "connects"
  }
}
