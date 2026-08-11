export interface SmsProvider {
  sendSms(to: string, body: string): Promise<void>;
}

export interface EmailProvider {
  sendEmail(to: string, subject: string, html: string, text?: string): Promise<void>;
  /** Optional connection check (SMTP verify). */
  verifyConnection?(): Promise<void>;
}
