import { PhysicalGateway } from '@/services/gateway/gateways/physical.gateway';
import { ProtocolVersion, DeviceType } from '@/types/gateway.types';

jest.mock('@/services/gateway/connections/websocket.connection', () => ({
  WebSocketConnection: jest.fn().mockImplementation((id, url, heartbeat) => ({
    id,
    url,
    heartbeat,
  })),
}));

describe('PhysicalGateway', () => {
  it('exposes production capabilities', () => {
    const gw = new PhysicalGateway('gw-1', 'fac-1', 'wss://gateway.example/ws');
    const caps = gw.capabilities;

    expect(caps.supportedProtocols).toEqual(
      expect.arrayContaining([ProtocolVersion.V1_0, ProtocolVersion.V1_1]),
    );
    expect(caps.supportedDeviceTypes).toEqual(
      expect.arrayContaining([DeviceType.LOCK, DeviceType.ACCESS_CONTROL]),
    );
    expect(caps.firmwareUpdateSupport).toBe(true);
    expect(caps.remoteAccessSupport).toBe(true);
  });

  it('creates websocket connection with configured heartbeat interval', () => {
    const { WebSocketConnection } = require('@/services/gateway/connections/websocket.connection');
    const gw = new PhysicalGateway('gw-1', 'fac-1', 'wss://gateway.example/ws');

    const connection = (gw as unknown as { createConnection: () => unknown }).createConnection();

    expect(WebSocketConnection).toHaveBeenCalledWith(
      'gw-1',
      'wss://gateway.example/ws',
      gw.capabilities.heartbeatInterval,
      10000,
    );
    expect(connection).toMatchObject({ id: 'gw-1', url: 'wss://gateway.example/ws' });
  });
});
