import { buildFromHeader } from '@/services/notifications/providers/smtp-email.provider';

describe('buildFromHeader', () => {
  it('quotes the display name', () => {
    expect(buildFromHeader('BluLok Support', 'noreply@blulok.com')).toBe(
      '"BluLok Support" <noreply@blulok.com>',
    );
  });

  it('returns a bare address when no name is configured', () => {
    expect(buildFromHeader(undefined, 'noreply@blulok.com')).toBe('noreply@blulok.com');
    expect(buildFromHeader('   ', 'noreply@blulok.com')).toBe('noreply@blulok.com');
  });

  it('strips CRLF so a From name cannot inject extra headers', () => {
    const header = buildFromHeader(
      'Evil\r\nBcc: attacker@example.com',
      'noreply@blulok.com',
    );

    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).toBe('"EvilBcc: attacker@example.com" <noreply@blulok.com>');
  });

  it('strips quotes and angle brackets so the name cannot escape the address', () => {
    expect(buildFromHeader('a" <spoof@evil.com> "b', 'noreply@blulok.com')).toBe(
      '"a spoof@evil.com b" <noreply@blulok.com>',
    );
  });
});
