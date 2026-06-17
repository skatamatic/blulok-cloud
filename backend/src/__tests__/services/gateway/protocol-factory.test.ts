import { ProtocolFactory } from '@/services/gateway/protocols/protocol-factory';
import { ProtocolVersion } from '@/types/gateway.types';

describe('ProtocolFactory', () => {
  beforeEach(() => {
    ProtocolFactory.clearCache();
  });

  it('creates and caches protocol instances by version', () => {
    const v1 = ProtocolFactory.createProtocol(ProtocolVersion.V1_0);
    const v1Again = ProtocolFactory.createProtocol(ProtocolVersion.V1_0);
    expect(v1).toBe(v1Again);

    const simulated = ProtocolFactory.createProtocol(ProtocolVersion.SIMULATED);
    expect(simulated).toBeDefined();
    expect(simulated).not.toBe(v1);
  });

  it('creates ProtocolV1 for V1_0 and V1_1 versions', () => {
    const v11 = ProtocolFactory.createProtocol(ProtocolVersion.V1_1);
    const v10 = ProtocolFactory.createProtocol(ProtocolVersion.V1_0);
    expect(v11).toBeDefined();
    expect(v10).toBeDefined();
    expect(v11.constructor.name).toBe(v10.constructor.name);
  });

  it('reports supported versions and latest', () => {
    expect(ProtocolFactory.isVersionSupported(ProtocolVersion.V1_1)).toBe(true);
    expect(ProtocolFactory.isVersionSupported(ProtocolVersion.SIMULATED)).toBe(true);
    expect(ProtocolFactory.getLatestVersion()).toBe(ProtocolVersion.V1_1);
    expect(ProtocolFactory.getSupportedVersions()).toEqual(
      expect.arrayContaining([
        ProtocolVersion.V1_0,
        ProtocolVersion.V1_1,
        ProtocolVersion.SIMULATED,
      ]),
    );
  });

  it('throws for unsupported protocol version', () => {
    expect(() =>
      ProtocolFactory.createProtocol('unknown' as ProtocolVersion),
    ).toThrow(/Unsupported protocol version/);
  });
});
