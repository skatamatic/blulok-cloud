import type { EmailInlineImage, EmailProvider } from './provider.types';

export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    _text?: string,
    _inlineImages?: EmailInlineImage[],
  ): Promise<void> {
    console.log(`[ConsoleEmail] -> ${to}: ${subject} | ${html}`);
  }

  async verifyConnection(): Promise<void> {
    // Console provider always "connects"
  }
}
