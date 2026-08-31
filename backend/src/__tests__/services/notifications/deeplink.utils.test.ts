import { isAllowedDeeplinkBase } from '@/services/notifications/deeplink.utils';

describe('isAllowedDeeplinkBase', () => {
  it.each([
    'blulok://',
    'blulok://app',
    'https://app.blulok.com/',
    'http://localhost:3000/',
    'http://127.0.0.1:5173/',
    '',
  ])('allows %s', (value) => {
    expect(isAllowedDeeplinkBase(value)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'http://evil.example.com/',
    'ftp://evil.example.com/',
    'not a url',
    '//evil.example.com',
  ])('rejects %s', (value) => {
    expect(isAllowedDeeplinkBase(value)).toBe(false);
  });
});
