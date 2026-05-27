import { GatewayTelemetryLogService } from '@/services/gateway-telemetry-log.service';
import { GatewayTelemetryLogModel } from '@/models/gateway-telemetry-log.model';

jest.mock('@/models/gateway-telemetry-log.model');

describe('GatewayTelemetryLogService', () => {
  const mockInsertAndTrim = jest.fn();
  const mockListByGateway = jest.fn();
  const mockBroadcastUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (GatewayTelemetryLogModel as jest.Mock).mockImplementation(() => ({
      insertAndTrim: mockInsertAndTrim,
      listByGateway: mockListByGateway,
    }));

    const manager = { broadcastUpdate: mockBroadcastUpdate };
    GatewayTelemetryLogService.getInstance().setSubscriptionRegistry({
      getManager: jest.fn().mockReturnValue(manager),
    } as any);
  });

  it('ingests parsed lines, trims retention, and broadcasts', async () => {
    const created = [
      {
        id: 'log-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        logged_at: new Date('2026-05-26T09:53:21.653Z'),
        payload: { message: 'hello' },
        source: 'gateway_ws',
        created_at: new Date(),
      },
    ];
    mockInsertAndTrim.mockResolvedValue(created);

    const result = await GatewayTelemetryLogService.getInstance().ingest(
      'fac-1',
      'gw-1',
      ['2026-05-26T09:53:21.653711 Gateway heartbeat OK'],
    );

    expect(mockInsertAndTrim).toHaveBeenCalledWith('gw-1', expect.any(Array));
    expect(mockInsertAndTrim.mock.calls[0][1][0].payload).toEqual({ message: 'Gateway heartbeat OK' });
    expect(mockBroadcastUpdate).toHaveBeenCalledWith(created);
    expect(result).toEqual(created);
  });

  it('caps ingest batch size', async () => {
    mockInsertAndTrim.mockResolvedValue([]);
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i}`);
    await GatewayTelemetryLogService.getInstance().ingest('fac-1', 'gw-1', lines);
    expect(mockInsertAndTrim.mock.calls[0][1]).toHaveLength(500);
  });

  it('returns empty array for blank lines only', async () => {
    const result = await GatewayTelemetryLogService.getInstance().ingest('fac-1', 'gw-1', ['  ', '']);
    expect(result).toEqual([]);
    expect(mockInsertAndTrim).not.toHaveBeenCalled();
  });

  it('delegates list to model', async () => {
    mockListByGateway.mockResolvedValue({ logs: [], total: 0 });
    const filters = { search: 'lock' };
    await GatewayTelemetryLogService.getInstance().list('gw-1', filters, { limit: 100, offset: 0 });
    expect(mockListByGateway).toHaveBeenCalledWith('gw-1', filters, { limit: 100, offset: 0 });
  });

  it('recordSystemEvent persists cloud_system rows and broadcasts', async () => {
    const created = [
      {
        id: 'sys-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        logged_at: new Date(),
        payload: { cloud_system: true, header: 'CLD01' },
        source: 'cloud_system',
        created_at: new Date(),
      },
    ];
    mockInsertAndTrim.mockResolvedValue(created);

    const result = await GatewayTelemetryLogService.getInstance().recordSystemEvent({
      event: 'gateway_connected',
      message: 'Gateway connected',
      facility_id: 'fac-1',
      gateway_id: 'gw-1',
    });

    expect(mockInsertAndTrim).toHaveBeenCalledWith(
      'gw-1',
      expect.arrayContaining([
        expect.objectContaining({
          source: 'cloud_system',
          payload: expect.objectContaining({
            cloud_system: true,
            header: 'CLD01',
            data: expect.objectContaining({ event: 'gateway_connected' }),
          }),
        }),
      ]),
    );
    expect(mockBroadcastUpdate).toHaveBeenCalledWith(created);
    expect(result).toEqual(created);
  });
});
