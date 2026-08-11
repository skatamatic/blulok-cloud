import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from '@/types/notification.types';
import type { EmailProvider } from './provider.types';

/**
 * Production SMTP email provider via nodemailer.
 */
export class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private from: string;
  private replyTo?: string;

  constructor(smtp: SmtpConfig) {
    // Lazy require so console-only deployments don't need the package at import time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');

    const port = smtp.port || 587;
    const encryption = smtp.encryption || 'starttls';
    const secure = encryption === 'tls'; // direct TLS (typically port 465)
    const requireTLS = encryption === 'starttls';

    const transportOptions: Record<string, unknown> = {
      host: smtp.host,
      port,
      secure,
      requireTLS,
      tls: {
        rejectUnauthorized: smtp.rejectUnauthorized !== false,
      },
    };

    const authMode = smtp.authMode || 'plain';
    if (authMode !== 'none' && smtp.username) {
      transportOptions.auth = {
        user: smtp.username,
        pass: smtp.password || '',
        // nodemailer uses 'login' method; 'plain' is negotiated via AUTH PLAIN
        ...(authMode === 'login' ? { method: 'LOGIN' } : {}),
      };
    }

    this.transporter = nodemailer.createTransport(transportOptions);
    this.from = smtp.fromName
      ? `"${smtp.fromName}" <${smtp.fromEmail}>`
      : smtp.fromEmail;
    this.replyTo = smtp.replyTo;
  }

  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      ...(this.replyTo ? { replyTo: this.replyTo } : {}),
    });
  }

  async verifyConnection(): Promise<void> {
    await this.transporter.verify();
  }
}
