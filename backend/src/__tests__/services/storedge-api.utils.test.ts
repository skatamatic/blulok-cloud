import { unwrapStoredgeEntity } from '@/services/fms/storedge-api.utils';

describe('unwrapStoredgeEntity', () => {
  it('returns a flat resource that already has an id', () => {
    expect(unwrapStoredgeEntity({ id: 'u1', name: '101' }, ['unit'])).toEqual({
      id: 'u1',
      name: '101',
    });
  });

  it('unwraps a single-resource envelope', () => {
    expect(
      unwrapStoredgeEntity({ unit: { id: 'u1', name: '101', status: 'occupied' } }, ['unit', 'data'])
    ).toEqual({ id: 'u1', name: '101', status: 'occupied' });
  });

  it('returns null when the payload has no id', () => {
    expect(unwrapStoredgeEntity({ unit: { name: '101' } }, ['unit'])).toBeNull();
    expect(unwrapStoredgeEntity({ unitType: '' }, ['unit'])).toBeNull();
    expect(unwrapStoredgeEntity(null, ['unit'])).toBeNull();
  });
});
