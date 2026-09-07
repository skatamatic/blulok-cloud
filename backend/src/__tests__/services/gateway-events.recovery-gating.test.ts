import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { GatewayRecoveryService } from '@/services/gateway/gateway-recovery.service';
import { _testBlockingFacilities, _testBlockingCache } from '@/services/gateway/gateway-recovery.service';

describe('GatewayEventsService recovery outbound gating', () => {
  const mockUnicast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    _testBlockingFacilities.clear();
    _testBlockingCache.clear();
    GatewayEventsService.getInstance().setTransport({
      initialize: jest.fn(),
      broadcast: jest.fn(),
      unicastToFacility: mockUnicast,
      shutdown: jest.fn(),
    });
  });

  it('drops operational commands while recovery blocking is active', () => {
    _testBlockingFacilities.add('fac-1');
    GatewayEventsService.getInstance().unicastToFacility('fac-1', { cmd_type: 'DENYLIST_ADD' });
    GatewayEventsService.getInstance().unicastToFacility('fac-1', { cmd_type: 'DEVICE_DELETED' });
    expect(mockUnicast).not.toHaveBeenCalled();
  });

  it('allows recovery push messages while blocking is active', () => {
    _testBlockingFacilities.add('fac-1');
    GatewayEventsService.getInstance().unicastToFacility('fac-1', { type: 'FIRMWARE_MANIFEST' });
    expect(mockUnicast).toHaveBeenCalledTimes(1);
  });

  it('allows operational commands when recovery is not blocking', () => {
    GatewayEventsService.getInstance().unicastToFacility('fac-1', { cmd_type: 'ACCESS_CODE_UPDATE' });
    expect(mockUnicast).toHaveBeenCalledTimes(1);
  });
});
