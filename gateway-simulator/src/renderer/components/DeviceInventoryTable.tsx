import { useCallback, useEffect, useMemo, useState } from 'react';
import { CpuChipIcon, SignalIcon } from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import type { DeviceInventoryItem, GatewayInventoryKind } from '@protocol/device-kinds';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { inventoryDeviceKey } from '../utils/device-inventory.utils';
import {
  DEFAULT_DEVICE_LIST_FILTERS,
  filterAndSortDevices,
  type DeviceListFilters,
} from '../utils/device-inventory-list.utils';
import { DeviceCard } from './DeviceCard';
import { DeviceDetailDrawer } from './DeviceDetailDrawer';
import { DeviceDetailView } from './DeviceDetailView';
import { DeviceListToolbar } from './DeviceListToolbar';
import { AddDeviceDropdown } from './AddDeviceDropdown';
import { RemoveDeviceDialog } from './RemoveDeviceDialog';
import {
  setSkipDeviceDeleteConfirmForSession,
  shouldConfirmDeviceDelete,
} from '../utils/device-delete-confirm.session';

type Props = {
  gateway: GatewayInstanceState;
  connected: boolean;
  embedded?: boolean;
  users?: import('@protocol/user-simulator-state').UserInstanceState[];
  onRefresh: () => void;
};

export function DeviceInventoryTable({ gateway, connected, embedded, users = [], onRefresh }: Props) {
  const toast = useToast();
  const [listFilters, setListFilters] = useState<DeviceListFilters>(DEFAULT_DEVICE_LIST_FILTERS);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string | null>(null);
  const [deviceToRemove, setDeviceToRemove] = useState<DeviceInventoryItem | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);

  useEffect(() => {
    setSelectedDeviceKey(null);
  }, [gateway.id]);

  useEffect(() => {
    if (!selectedDeviceKey) return;
    const exists = gateway.devices.some((d) => inventoryDeviceKey(d) === selectedDeviceKey);
    if (!exists) setSelectedDeviceKey(null);
  }, [gateway.devices, selectedDeviceKey]);

  const visibleDevices = useMemo(
    () => filterAndSortDevices(gateway.devices, listFilters),
    [gateway.devices, listFilters],
  );

  const updateListFilters = useCallback((patch: Partial<DeviceListFilters>) => {
    setListFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearListFilters = useCallback(() => {
    setListFilters(DEFAULT_DEVICE_LIST_FILTERS);
  }, []);

  const patchDevice = useCallback(
    async (item: DeviceInventoryItem, patch: Partial<DeviceInventoryItem>) => {
      const key = inventoryDeviceKey(item);
      try {
        await window.simulator.updateDevice(gateway.id, key, patch);
      } catch (err) {
        toast.error('Could not update device', errorMessage(err));
      }
    },
    [gateway.id, toast],
  );

  const addDevice = async (kind: GatewayInventoryKind) => {
    try {
      await window.simulator.addDevice(gateway.id, kind);
      onRefresh();
    } catch (err) {
      toast.error('Could not add device', errorMessage(err));
    }
  };

  const performRemove = async (key: string) => {
    try {
      await window.simulator.removeDevice(gateway.id, key);
      onRefresh();
    } catch (err) {
      toast.error('Could not remove device', errorMessage(err));
    }
  };

  const requestRemove = (key: string) => {
    const item = gateway.devices.find((device) => inventoryDeviceKey(device) === key);
    if (!item) return;
    if (!shouldConfirmDeviceDelete()) {
      void performRemove(key);
      return;
    }
    setSkipDeleteConfirm(false);
    setDeviceToRemove(item);
  };

  const cancelRemove = () => {
    if (removeBusy) return;
    setDeviceToRemove(null);
    setSkipDeleteConfirm(false);
  };

  const confirmRemove = async () => {
    if (!deviceToRemove || removeBusy) return;
    const key = inventoryDeviceKey(deviceToRemove);
    if (skipDeleteConfirm) {
      setSkipDeviceDeleteConfirmForSession(true);
    }
    setRemoveBusy(true);
    try {
      await performRemove(key);
      setDeviceToRemove(null);
      setSkipDeleteConfirm(false);
    } finally {
      setRemoveBusy(false);
    }
  };

  const syncLabel = connected ? 'Live sync on' : 'Live sync when connected';

  return (
    <div className={embedded ? 'devices-view devices-view-embedded space-y-4' : 'devices-view card'}>
      <header className="devices-page-header">
        <div className="devices-page-header-copy">
          <h3 className="devices-page-title">Devices</h3>
          <p className="devices-page-subtitle">
            Manage simulated inventory and quick controls. Open device details to simulate access events.
            {!connected && ' Connect to push device changes to the cloud.'}
          </p>
        </div>
        <div className="devices-page-header-actions">
          <span
            className={`devices-sync-pill ${connected ? 'devices-sync-pill-live' : ''}`}
            title={syncLabel}
          >
            <SignalIcon className="h-3.5 w-3.5" aria-hidden />
            {syncLabel}
          </span>
          <AddDeviceDropdown onSelect={addDevice} />
        </div>
      </header>

      {gateway.devices.length > 0 && (
        <DeviceListToolbar
          filters={listFilters}
          totalCount={gateway.devices.length}
          visibleCount={visibleDevices.length}
          onChange={updateListFilters}
          onClear={clearListFilters}
        />
      )}

      <div className="device-list">
        {visibleDevices.map((item) => (
          <DeviceCard
            key={inventoryDeviceKey(item)}
            item={item}
            onPatch={patchDevice}
            onRemove={requestRemove}
            onOpenDetails={setSelectedDeviceKey}
          />
        ))}

        {!gateway.devices.length && (
          <div className="device-list-empty">
            <CpuChipIcon className="device-list-empty-icon" aria-hidden />
            <p className="device-list-empty-title">No devices yet</p>
            <p className="device-list-empty-desc">
              Add locks, access control, bridges, or friend nodes to populate this gateway inventory.
            </p>
          </div>
        )}

        {gateway.devices.length > 0 && visibleDevices.length === 0 && (
          <div className="device-list-empty">
            <p className="device-list-empty-title">No devices match your filters</p>
            <p className="device-list-empty-desc">Try clearing search or filter criteria.</p>
            <button type="button" className="btn-secondary mt-4" onClick={clearListFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      <RemoveDeviceDialog
        device={deviceToRemove}
        isLoading={removeBusy}
        dontAskAgain={skipDeleteConfirm}
        onDontAskAgainChange={setSkipDeleteConfirm}
        onConfirm={() => void confirmRemove()}
        onCancel={cancelRemove}
      />

      <DeviceDetailDrawer deviceKey={selectedDeviceKey} onClose={() => setSelectedDeviceKey(null)}>
        {(deviceKey) => (
          <DeviceDetailView
            gateway={gateway}
            deviceKey={deviceKey}
            connected={connected}
            users={users}
            onRefresh={onRefresh}
          />
        )}
      </DeviceDetailDrawer>
    </div>
  );
}
