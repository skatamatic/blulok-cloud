import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from '@/types/notification.types';
import type { EmailProvider } from './provider.types';
import {
  extractSmtpEmailAddress,
  isSmtpRecipientRejected,
  isSmtpSenderRejected,
  SMTP_FROM_PROBE_SINK,
} from './smtp-verify.utils';

/**
 * Quote the display name and strip CR/LF plus quote characters so an admin-set
 * From name cannot inject extra headers or break out of the address.
 */
export function buildFromHeader(fromName: string | undefined, fromEmail: string): string {
  const address = fromEmail.replace(/[\r\n]/g, '').trim();
  const name = (fromName || '').replace(/[\r\n"\\<>]/g, '').trim();
  return name ? `"${name}" <${address}>` : address;
}

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
    this.from = buildFromHeader(smtp.fromName, smtp.fromEmail);
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

  /**
   * 1) Login / TLS (nodemailer verify)
   * 2) MAIL FROM probe — send toward an undeliverable sink and classify the error.
   *    Auth-only verify misses "From not owned by SMTP user" (553), which breaks invites.
   */
  async verifyConnection(): Promise<void> {
    await this.transporter.verify();
    await this.verifyFromAddressAccepted();
  }

  private async verifyFromAddressAccepted(): Promise<void> {
    const fromAddr = extractSmtpEmailAddress(this.from);
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: SMTP_FROM_PROBE_SINK,
        subject: 'BluLok SMTP From-address probe',
        text: 'BluLok connection test probe — discard if received.',
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      });
      // Unusual: sink accepted. From was clearly allowed.
      return;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (isSmtpSenderRejected(message)) {
        throw new Error(
          `SMTP login succeeded, but From address "${fromAddr}" was rejected. ` +
            `Set From email to an address this SMTP user may send as (often the same as Username). ` +
            `Server: ${message}`,
        );
      }
      if (isSmtpRecipientRejected(message)) {
        // Expected — MAIL FROM accepted, undeliverable RCPT rejected.
        return;
      }
      throw new Error(
        `SMTP From-address check failed for "${fromAddr}": ${message}`,
      );
    }
  }
}
