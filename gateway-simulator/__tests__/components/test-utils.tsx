import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import { DEFAULT_BEHAVIOR, type GatewayInstanceState } from '@protocol/ipc-channels';
import { ToastProvider } from '../../src/renderer/contexts/ToastContext';
import { resetDeviceDeleteConfirmSession } from '../../src/renderer/utils/device-delete-confirm.session';

export function sampleLock(overrides: Partial<Extract<DeviceInventoryItem, { kind: 'lock' }>> = {}): DeviceInventoryItem {
  return {
    kind: 'lock',
    lock_id: 'LOCK-100',
    lock_number: 100,
    state: 'CLOSED',
    locked: true,
    online: true,
    firmware_version: '2.0.0',
    ...overrides,
  };
}

export function sampleGateway(overrides: Partial<GatewayInstanceState> = {}): GatewayInstanceState {
  return {
    id: 'gw-local-1',
    label: 'Lab Gateway',
    backendUrl: 'http://127.0.0.1:3000',
    facilityId: 'fac-1',
    facilityName: 'Test Facility',
    gatewayId: 'cloud-gw-1',
    connectionStatus: 'connected',
    sessionRole: 'active',
    devices: [],
    deviceSimByKey: {},
    behavior: DEFAULT_BEHAVIOR,
    events: [],
    ...overrides,
  };
}

export function createSimulatorMock() {
  return {
    addDevice: vi.fn().mockResolvedValue(undefined),
    removeDevice: vi.fn().mockResolvedValue(undefined),
    updateDevice: vi.fn().mockResolvedValue(undefined),
  };
}

export function installSimulatorMock(mock = createSimulatorMock()) {
  Object.assign(window, { simulator: mock as unknown as Window['simulator'] });
  return mock;
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <ToastProvider>{children}</ToastProvider>;
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
