export type ShareKeyAccessLevel = 'full' | 'limited' | 'temporary' | 'permanent';

export function isValidShareInvitePhone(value: string): boolean {
  const raw = (value || '').trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  return raw.startsWith('+') ? digits.length >= 10 : digits.length >= 10;
}
