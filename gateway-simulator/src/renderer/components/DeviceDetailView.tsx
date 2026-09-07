import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import type { UserInstanceState } from '@protocol/user-simulator-state';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import {
  buildDeviceSummaryStats,
  inventoryDeviceKey,
  inventoryDeviceLabel,
  KIND_LABELS,
  kindBadgeClass,
} from '../utils/device-inventory.utils';
import {
  deviceDetailTabsForKind,
  normalizeDeviceDetailTab,
  readDeviceDetailTab,
  writeDeviceDetailTab,
  type DeviceDetailTabId,
} from '../utils/device-detail.utils';
import { ConfirmDialog } from './ConfirmDialog';
import { DeviceDetailNav } from './device-detail/DeviceDetailNav';
import { DeviceDetailOverviewSection } from './device-detail/DeviceDetailOverviewSection';
import { DeviceDetailSecuritySection } from './device-detail/DeviceDetailSecuritySection';
import { DeviceDetailActivitySection } from './device-detail/DeviceDetailActivitySection';
import { DeviceDetailSimulateSection } from './device-detail/DeviceDetailSimulateSection';
import type { DeviceDetailUpdateRequest } from './device-detail/device-detail.types';

type Props = {
  gateway: GatewayInstanceState;
  deviceKey: string;
  connected: boolean;
  users?: UserInstanceState[];
  onRefresh: () => void;
};

export function DeviceDetailView({ gateway, deviceKey, connected, users = [], onRefresh }: Props) {
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const item = gateway.devices.find((d) => inventoryDeviceKey(d) === deviceKey);
  const sim = gateway.deviceSimByKey[deviceKey];
  const label = item ? inventoryDeviceLabel(item) : deviceKey;
  const online = (item as { online?: boolean } | undefined)?.online ?? false;
  const summaryStats = useMemo(() => (item ? buildDeviceSummaryStats(item) : []), [item]);

  const visibleTabs = useMemo(
    () => (item ? deviceDetailTabsForKind(item.kind) : ['overview' as DeviceDetailTabId]),
    [item],
  );

  const [activeTab, setActiveTab] = useState<DeviceDetailTabId>(() => {
    const stored = readDeviceDetailTab();
    return visibleTabs.includes(stored) ? stored : 'overview';
  });

  useEffect(() => {
    setActiveTab((current) => {
      const normalized = normalizeDeviceDetailTab(current) ?? 'overview';
      return visibleTabs.includes(normalized) ? normalized : 'overview';
    });
  }, [deviceKey, visibleTabs]);

  const handleTabChange = useCallback((tab: DeviceDetailTabId) => {
    setActiveTab(tab);
    writeDeviceDetailTab(tab);
  }, []);

  const applyUpdate = useCallback(
    async (req: DeviceDetailUpdateRequest) => {
      try {
        await window.simulator.updateDeviceSim(gateway.id, deviceKey, req);
        onRefresh();
      } catch (err) {
        toast.error('Could not update device', errorMessage(err));
      }
    },
    [deviceKey, gateway.id, onRefresh, toast],
  );

  const resetDevice = async () => {
    setResetBusy(true);
    try {
      await window.simulator.resetDevice(gateway.id, deviceKey);
      onRefresh();
      toast.success('Device reset to defaults');
      setConfirmReset(false);
    } catch (err) {
      toast.error('Reset failed', errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  };

  if (!item || !sim) {
    return (
      <div className="device-detail device-detail-missing">
        <p className="text-sm text-gray-500">Device not found.</p>
      </div>
    );
  }
  const sectionProps = {
    gateway,
    deviceKey,
    item,
    sim,
    connected,
    users,
    onRefresh,
    applyUpdate,
  };

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'overview':
        return <DeviceDetailOverviewSection {...sectionProps} />;
      case 'security':
        return <DeviceDetailSecuritySection {...sectionProps} />;
      case 'simulate':
        return <DeviceDetailSimulateSection {...sectionProps} />;
      case 'activity':
        return <DeviceDetailActivitySection {...sectionProps} />;
      default:
        return <DeviceDetailOverviewSection {...sectionProps} />;
    }
  };

  return (
    <div className="device-detail">
      <header className="device-detail-header">
        <div className="device-detail-header-main">
          <div className="device-detail-header-badges">
            <span className={`kind-badge ${kindBadgeClass(item.kind)}`}>
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            <span className={`device-detail-status-pill ${online ? 'device-detail-status-pill-online' : ''}`}>
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          <h3 className="device-detail-title">{label}</h3>
          <p className="device-detail-key" title={deviceKey}>{deviceKey}</p>
          {summaryStats.length > 0 && (
            <div className="device-detail-header-stats">
              {summaryStats.map((stat) => (
                <span key={stat.key} className={`device-stat device-stat-${stat.tone ?? 'neutral'}`}>
                  {stat.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-secondary device-detail-reset-btn inline-flex items-center gap-2 shrink-0"
          onClick={() => setConfirmReset(true)}
        >
          <ArrowPathIcon className="h-4 w-4" aria-hidden />
          Reset defaults
        </button>
      </header>

      <div className="device-detail-layout">
        <DeviceDetailNav
          active={activeTab}
          visibleTabs={visibleTabs}
          onChange={handleTabChange}
        />
        <div
          className="device-detail-content"
          role="tabpanel"
          id={`device-detail-panel-${activeTab}`}
          aria-labelledby={`device-detail-tab-${activeTab}`}
        >
          {renderActiveSection()}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        title="Reset device defaults?"
        message={
          <>
            Reset <strong>{label}</strong> to factory defaults? Identity fields are preserved.
          </>
        }
        confirmLabel="Reset defaults"
        confirmTone="danger"
        isLoading={resetBusy}
        onCancel={() => {
          if (resetBusy) return;
          setConfirmReset(false);
        }}
        onConfirm={() => void resetDevice()}
      />
    </div>
  );
}
