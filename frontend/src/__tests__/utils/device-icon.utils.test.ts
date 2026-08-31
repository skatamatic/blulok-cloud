import {
  formatAccessControlDeviceTypeLabel,
  formatNetworkInfraKindLabel,
  getDeviceIconMeta,
  getNetworkInfraKindIcon,
} from '@/utils/device-icon.utils';
import { BoltIcon, LockClosedIcon, ServerIcon, SignalIcon } from '@heroicons/react/24/outline';

describe('device-icon.utils', () => {
  it('returns BluLok meta for blulok devices', () => {
    const meta = getDeviceIconMeta({ device_category: 'blulok' });
    expect(meta.Icon).toBe(LockClosedIcon);
    expect(meta.label).toBe('BluLok');
  });

  it('returns access control type icon and label', () => {
    const meta = getDeviceIconMeta({ device_category: 'access_control', device_type: 'gate' });
    expect(meta.Icon).toBe(BoltIcon);
    expect(meta.label).toBe('Gate');
  });

  it('returns network infra kind icon and label', () => {
    expect(getNetworkInfraKindIcon('gateway')).toBe(ServerIcon);
    expect(getNetworkInfraKindIcon('bridge')).toBe(SignalIcon);
    expect(formatNetworkInfraKindLabel('gateway')).toBe('Gateway');
  });

  it('formats access control labels', () => {
    expect(formatAccessControlDeviceTypeLabel('elevator')).toBe('Elevator');
    expect(formatAccessControlDeviceTypeLabel(undefined)).toBe('Access Control');
  });

  it('resolves network infra meta from device_kind', () => {
    const meta = getDeviceIconMeta({
      device_category: 'network_infra',
      device_kind: 'gateway',
    });
    expect(meta.Icon).toBe(ServerIcon);
    expect(meta.label).toBe('Gateway');
    expect(meta.containerClass).toContain('indigo');
  });
});
