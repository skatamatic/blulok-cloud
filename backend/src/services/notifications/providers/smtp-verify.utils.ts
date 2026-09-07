/**
 * Classify SMTP send errors from a From-address probe (send to a sink recipient).
 * Pure helpers so tests don't need a live mail server.
 */

export function extractSmtpEmailAddress(fromHeader: string): string {
  const angle = fromHeader.match(/<([^>]+)>/);
  return (angle ? angle[1] : fromHeader).trim();
}

/** True when the server rejected MAIL FROM / From (the invite-resend 553 case). */
export function isSmtpSenderRejected(message: string): boolean {
  return /sender address rejected|not owned by user|from address.*(not allowed|rejected)|unauthenticated senders not allowed/i.test(
    message,
  );
}

/**
 * True when failure looks like RCPT TO rejection — meaning MAIL FROM was accepted.
 * Used by the connection test probe that intentionally uses an undeliverable sink.
 */
export function isSmtpRecipientRejected(message: string): boolean {
  if (isSmtpSenderRejected(message)) return false;
  return /recipient.*(rejected|failed|unknown)|user unknown|mailbox (unavailable|not found)|no such user|invalid recipient|relay access denied|550\s*5\.[12]|551\s|552\s|553\s*5\.1/i.test(
    message,
  );
}

/** Reserved undeliverable address for From-address probes (RFC 2606 .invalid). */
export const SMTP_FROM_PROBE_SINK = 'blulok-smtp-probe@invalid.invalid';
