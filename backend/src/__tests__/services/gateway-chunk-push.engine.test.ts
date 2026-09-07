import { GatewayChunkPushEngine, _testActiveChunkPushes } from '@/services/provisioning/gateway-chunk-push.engine';

jest.mock('@/services/crypto/ed25519.service', () => ({
  Ed25519Service: {
    signCommandJwt: jest.fn().mockResolvedValue('signed-jwt'),
  },
}));

const mockUnicast = jest.fn();
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn().mockReturnValue({
      getFacilityConnectionStatus: jest.fn().mockReturnValue({ connected: true }),
      unicastToFacility: (...args: unknown[]) => mockUnicast(...args),
    }),
  },
}));

describe('GatewayChunkPushEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _testActiveChunkPushes.clear();
  });

  const binary = Buffer.alloc(100, 7);

  it('returns complete after all chunks are ACKed', async () => {
    const pushPromise = GatewayChunkPushEngine.executePush({
      pushId: 'push-1',
      facilityId: 'fac-1',
      nonce: 'nonce-1',
      binary,
      manifestCmdType: 'TEST_MANIFEST',
      chunkCmdType: 'TEST_CHUNK',
      manifestMessageType: 'TEST_MANIFEST',
      chunkMessageType: 'TEST_CHUNK',
      buildManifestPayload: (chunkCount, chunkSize) => ({ chunk_count: chunkCount, chunk_size: chunkSize }),
      buildChunkPayload: () => ({}),
    });

    await new Promise((r) => setTimeout(r, 250));

    await GatewayChunkPushEngine.handleChunkAck('fac-1', {
      nonce: 'nonce-1',
      chunkIndex: 0,
      status: 'ok',
    });

    const outcome = await pushPromise;
    expect(outcome).toEqual({ status: 'complete' });
    expect(mockUnicast).toHaveBeenCalled();
  }, 15000);

  it('returns disconnect when push is paused on gateway disconnect', async () => {
    const pushPromise = GatewayChunkPushEngine.executePush({
      pushId: 'push-2',
      facilityId: 'fac-1',
      nonce: 'nonce-2',
      binary,
      manifestCmdType: 'TEST_MANIFEST',
      chunkCmdType: 'TEST_CHUNK',
      manifestMessageType: 'TEST_MANIFEST',
      chunkMessageType: 'TEST_CHUNK',
      buildManifestPayload: (chunkCount) => ({ chunk_count: chunkCount }),
      buildChunkPayload: () => ({}),
    });

    await new Promise((r) => setTimeout(r, 250));
    GatewayChunkPushEngine.pausePushOnDisconnect('fac-1');

    const outcome = await pushPromise;
    expect(outcome).toEqual({ status: 'disconnect' });
  });

  it('returns cancelled when push is cancelled mid-transfer', async () => {
    const pushPromise = GatewayChunkPushEngine.executePush({
      pushId: 'push-3',
      facilityId: 'fac-1',
      nonce: 'nonce-3',
      binary,
      manifestCmdType: 'TEST_MANIFEST',
      chunkCmdType: 'TEST_CHUNK',
      manifestMessageType: 'TEST_MANIFEST',
      chunkMessageType: 'TEST_CHUNK',
      buildManifestPayload: (chunkCount) => ({ chunk_count: chunkCount }),
      buildChunkPayload: () => ({}),
    });

    await new Promise((r) => setTimeout(r, 250));
    GatewayChunkPushEngine.cancelPush('push-3');

    const outcome = await pushPromise;
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('resolves chunk ACK by nonce and chunk index', async () => {
    GatewayChunkPushEngine.registerPush('push-ack', 'fac-1', 'nonce-ack');
    const state = _testActiveChunkPushes.get('push-ack')!;
    const ackPromise = new Promise<void>((resolve, reject) => {
      state.chunkAckResolvers.set(0, { resolve, reject });
    });

    await GatewayChunkPushEngine.handleChunkAck('fac-1', {
      nonce: 'nonce-ack',
      chunkIndex: 0,
      status: 'ok',
    });

    await expect(ackPromise).resolves.toBeUndefined();
  });
});
