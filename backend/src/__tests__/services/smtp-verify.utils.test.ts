import {
  extractSmtpEmailAddress,
  isSmtpRecipientRejected,
  isSmtpSenderRejected,
} from '@/services/notifications/providers/smtp-verify.utils';

describe('smtp-verify.utils', () => {
  it('extracts bare and angle-bracket From addresses', () => {
    expect(extractSmtpEmailAddress('android1@24hrproto.net')).toBe('android1@24hrproto.net');
    expect(extractSmtpEmailAddress('"BluLok" <android1@24hrproto.net>')).toBe(
      'android1@24hrproto.net',
    );
  });

  it('detects sender rejection (invite 553 case)', () => {
    const msg =
      "Can't send mail - all recipients were rejected: 553 5.7.1 <tulsi.vanol@realizemfg.ca>: Sender address rejected: not owned by user android1@24hrproto.net";
    expect(isSmtpSenderRejected(msg)).toBe(true);
    expect(isSmtpRecipientRejected(msg)).toBe(false);
  });

  it('treats undeliverable sink RCPT failures as recipient rejection', () => {
    const msg = '550 5.1.1 <blulok-smtp-probe@invalid.invalid>: Recipient address rejected: User unknown';
    expect(isSmtpRecipientRejected(msg)).toBe(true);
    expect(isSmtpSenderRejected(msg)).toBe(false);
  });
});
