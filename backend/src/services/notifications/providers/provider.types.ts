export interface SmsProvider {
  sendSms(to: string, body: string): Promise<void>;
}

/** CID inline image for HTML email (facility branding). */
export interface EmailInlineImage {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailProvider {
  sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
    inlineImages?: EmailInlineImage[],
  ): Promise<void>;
  /** Optional connection check (SMTP verify). */
  verifyConnection?(): Promise<void>;
}
