import { ZtpPendingStore } from '@/services/gateway/ztp/ztp-pending.store';

describe('ZtpPendingStore', () => {
  beforeEach(() => {
    ZtpPendingStore.resetInstanceForTests();
  });

  it('stores and retrieves a pending session', () => {
    const store = ZtpPendingStore.getInstance();
    const ws = { close: jest.fn() } as any;
    store.put({
      deviceId: '123e4567-e89b-12d3-a456-426614174000',
      publicKey: 'pk',
      ws,
      nonce: 'n1',
    });
    const got = store.get('123e4567-e89b-12d3-a456-426614174000');
    expect(got?.publicKey).toBe('pk');
    expect(got?.nonce).toBe('n1');
  });

  it('replaces prior session and closes old ws', () => {
    const store = ZtpPendingStore.getInstance();
    const ws1 = { close: jest.fn() } as any;
    const ws2 = { close: jest.fn() } as any;
    const id = '123e4567-e89b-12d3-a456-426614174001';
    store.put({ deviceId: id, publicKey: 'a', ws: ws1, nonce: '1' });
    store.put({ deviceId: id, publicKey: 'b', ws: ws2, nonce: '2' });
    expect(ws1.close).toHaveBeenCalled();
    expect(store.get(id)?.publicKey).toBe('b');
  });
});
