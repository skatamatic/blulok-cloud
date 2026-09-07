import { formatPhoneDisplay, formatPhoneE164, toE164 } from '@/utils/phone.util';

describe('phone.util', () => {
  it('normalizes US numbers to E.164', () => {
    expect(toE164('7802656992')).toBe('+17802656992');
    expect(toE164('17802656992')).toBe('+17802656992');
    expect(toE164('+17802656992')).toBe('+17802656992');
  });

  it('formats NANP phones for templates', () => {
    expect(formatPhoneDisplay('+17802656992')).toBe('1-780-265-6992');
    expect(formatPhoneDisplay('(780) 265-6992')).toBe('1-780-265-6992');
    expect(formatPhoneDisplay('403-555-0100')).toBe('1-403-555-0100');
  });

  it('uses E.164 for non-NANP numbers and blanks missing values', () => {
    expect(formatPhoneDisplay('+447911123456')).toBe('+447911123456');
    expect(formatPhoneDisplay('')).toBe('');
    expect(formatPhoneDisplay(null)).toBe('');
  });

  it('exposes a dedicated E.164 formatter', () => {
    expect(formatPhoneE164('7802656992')).toBe('+17802656992');
    expect(formatPhoneE164('+17802656992')).toBe('+17802656992');
    expect(formatPhoneE164('')).toBe('');
  });
});
