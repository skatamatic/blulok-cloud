import type { ComponentType, SVGProps } from 'react';
import {
  CommandLineIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  SignalIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import {
  GATEWAY_PANEL_TABS,
  type GatewayPanelTabId,
} from '../utils/gateway-panel.utils';
import { useStackedPanelHeader } from '../hooks/use-stacked-panel-header';
import { GatewayTabIdentity } from './GatewayTabIdentity';
import { GatewayToolbar } from './GatewayToolbar';

type Props = {
  active: GatewayPanelTabId;
  gateway: GatewayInstanceState;
  connected: boolean;
  connecting: boolean;
  onRefresh: () => void;
  onChange: (tab: GatewayPanelTabId) => void;
};

const TAB_ICONS: Record<GatewayPanelTabId, ComponentType<SVGProps<SVGSVGElement>>> = {
  devices: CpuChipIcon,
  connection: SignalIcon,
  behavior: WrenchScrewdriverIcon,
  settings: Cog6ToothIcon,
  logs: CommandLineIcon,
};

function tabBadge(tab: GatewayPanelTabId, gateway: GatewayInstanceState): string | null {
  switch (tab) {
    case 'devices':
      return gateway.devices.length ? String(gateway.devices.length) : null;
    case 'logs':
      return gateway.events.length ? String(gateway.events.length) : null;
    default:
      return null;
  }
}

export function GatewayPanelTabs({
  active,
  gateway,
  connected,
  connecting,
  onRefresh,
  onChange,
}: Props) {
  const { headerRef, stacked } = useStackedPanelHeader();

  return (
    <div
      ref={headerRef}
      className={`gateway-panel-header${stacked ? ' gateway-panel-header-stacked' : ''}`}
    >
      <nav className="panel-tab-bar" aria-label="Gateway panel sections">
        <GatewayTabIdentity gateway={gateway} />

        <div className="panel-tab-row">
          <div className="panel-tab-list" role="tablist">
            {GATEWAY_PANEL_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.id];
              const badge = tabBadge(tab.id, gateway);
              const isActive = active === tab.id;

              return (
                <button
                key={tab.id}
                type="button"
                role="tab"
                id={`gateway-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`gateway-panel-${tab.id}`}
                  title={tab.hint}
                  className={`panel-tab ${isActive ? 'panel-tab-active' : ''}`}
                  onClick={() => onChange(tab.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="panel-tab-label">{tab.label}</span>
                  {badge && <span className="panel-tab-badge">{badge}</span>}
                </button>
              );
            })}
          </div>

          <GatewayToolbar
            gateway={gateway}
            connected={connected}
            connecting={connecting}
            onRefresh={onRefresh}
          />
        </div>
      </nav>
    </div>
  );
}
