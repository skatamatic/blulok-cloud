import {
  coerceOptionalAccessId,
  isPlaceholderAccessString,
  isUsableAccessDisplayName,
  readMetadataNumber,
  readMetadataString,
} from '@/utils/access-event-placeholder.utils';

describe('access-event-placeholder.utils', () => {
  it('detects gateway placeholder strings', () => {
    expect(isPlaceholderAccessString('Unknown User')).toBe(true);
    expect(isPlaceholderAccessString('unknown-unit-id')).toBe(true);
    expect(isPlaceholderAccessString('unknown-app-device')).toBe(true);
    expect(isPlaceholderAccessString('none')).toBe(true);
    expect(isPlaceholderAccessString('')).toBe(true);
    expect(isPlaceholderAccessString(null)).toBe(true);
    expect(isPlaceholderAccessString('Jane Tenant')).toBe(false);
  });

  it('rejects placeholders as display names', () => {
    expect(isUsableAccessDisplayName('Unknown User')).toBe(false);
    expect(isUsableAccessDisplayName('user')).toBe(false);
    expect(isUsableAccessDisplayName('Pat Smith')).toBe(true);
  });

  it('coerces optional ids and strips placeholders', () => {
    expect(coerceOptionalAccessId('  abc  ')).toBe('abc');
    expect(coerceOptionalAccessId('unknown-unit-id')).toBeUndefined();
    expect(coerceOptionalAccessId(undefined)).toBeUndefined();
  });

  it('reads metadata scalars', () => {
    const meta = { hardware_lock_id: 'lock-1', lock_number: 121, unit_id: 'unknown-unit-id' };
    expect(readMetadataString(meta, 'hardware_lock_id')).toBe('lock-1');
    expect(readMetadataNumber(meta, 'lock_number')).toBe(121);
    expect(readMetadataString(meta, 'missing')).toBeUndefined();
  });
});
