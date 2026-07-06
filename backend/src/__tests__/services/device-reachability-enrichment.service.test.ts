import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';
import { GatewayModel } from '@/models/gateway.model';

jest.mock('@/models/gateway.model');
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn().mockReturnValue({
      getFacilityConnectionStatus: jest.fn().mockReturnValue({ connected: false }),
    }),
  },
}));

describe('DeviceReachabilityEnrichmentService', () => {
  beforeEach(() => {
    DeviceReachabilityEnrichmentService.resetForTests();
    (GatewayModel as jest.MockedClass<typeof GatewayModel>).mockImplementation(
      () =>
        ({
          findByFacilityId: jest.fn().mockResolvedValue({ status: 'online' }),
        }) as unknown as GatewayModel,
    );
  });

  it('enriches BluLok rows using raw device_status from DB', async () => {
    const enricher = DeviceReachabilityEnrichmentService.getInstance();
    const cache = await enricher.createLivenessCache();
    const result = await enricher.enrichBluLokRow(
      {
        id: 'd1',
        facility_id: 'fac-1',
        device_status: 'online',
      },
      cache,
    );

    expect(result.device_status).toBe('offline');
    expect(result.reported_device_status).toBe('online');
    expect(result.status_unreachable_reason).toBe('gateway_offline');
  });

  it('is idempotent when row is already enriched', async () => {
    const enricher = DeviceReachabilityEnrichmentService.getInstance();
    const cache = await enricher.createLivenessCache();
    const first = await enricher.enrichBluLokRow(
      {
        id: 'd1',
        facility_id: 'fac-1',
        device_status: 'online',
      },
      cache,
    );
    const second = await enricher.enrichBluLokRow(first, cache);

    expect(second).toEqual(first);
  });

  it('skips child-device coercion for gateway rows in network infra lists', async () => {
    const enricher = DeviceReachabilityEnrichmentService.getInstance();
    const cache = await enricher.createLivenessCache();
    const result = await enricher.enrichNetworkInfraRow(
      {
        id: 'gw-1',
        device_kind: 'gateway',
        facility_id: 'fac-1',
        status: 'online',
      },
      cache,
    );

    expect(result.status).toBe('online');
    expect(result.reported_status).toBe('online');
    expect(result.status_unreachable_reason).toBeNull();
  });

  it('coerces infra rows using raw state', async () => {
    const enricher = DeviceReachabilityEnrichmentService.getInstance();
    const cache = await enricher.createLivenessCache();
    const result = await enricher.enrichNetworkInfraRow(
      {
        id: 'bridge-1',
        device_kind: 'bridge',
        facility_id: 'fac-1',
        state: 'healthy',
        status: 'online',
      },
      cache,
    );

    expect(result.status).toBe('offline');
    expect(result.reported_status).toBe('online');
    expect(result.status_unreachable_reason).toBe('gateway_offline');
  });

  it('enriches facility device hierarchy device arrays', async () => {
    const enricher = DeviceReachabilityEnrichmentService.getInstance();
    const result = await enricher.enrichFacilityDeviceHierarchy({
      facility: { id: 'fac-1', name: 'Test' },
      gateway: { id: 'gw-1', status: 'online' },
      accessControlDevices: [{ id: 'ac-1', facility_id: 'fac-1', status: 'online' }],
      blulokDevices: [{ id: 'd-1', facility_id: 'fac-1', device_status: 'online' }],
    });

    expect(result.blulokDevices[0].device_status).toBe('offline');
    expect(result.blulokDevices[0].reported_device_status).toBe('online');
    expect(result.accessControlDevices[0].status).toBe('offline');
    expect(result.accessControlDevices[0].reported_status).toBe('online');
  });
});
