import { useRef, useState } from 'react';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { ConnectionStatus } from './ConnectionStatus';
import { DeviceInventoryTable } from './DeviceInventoryTable';
import { BehaviorConfigPanel } from './BehaviorConfigPanel';
import { EventLogConsole } from './EventLogConsole';
import { StateControls } from './StateControls';
import { DisconnectedBanner } from './DisconnectedBanner';
import { GatewayPanelTabs } from './GatewayPanelTabs';
import { GatewaySettingsPanel } from './GatewaySettingsPanel';
import {
  PanelTabTransition,
  resolveTabSlideDirection,
  type TabSlideDirection,
} from './PanelTabTransition';
import {
  readGatewayPanelTab,
  writeGatewayPanelTab,
  type GatewayPanelTabId,
} from '../utils/gateway-panel.utils';

type Props = {
  gateway: GatewayInstanceState;
  users?: import('@protocol/user-simulator-state').UserInstanceState[];
  onRefresh: () => void;
};

export function GatewayPanel({ gateway, users = [], onRefresh }: Props) {
  const connected = gateway.connectionStatus === 'connected';
  const connecting = gateway.connectionStatus === 'connecting';
  const [tab, setTab] = useState<GatewayPanelTabId>(readGatewayPanelTab);
  const [tabDirection, setTabDirection] = useState<TabSlideDirection>('right');
  const previousTabRef = useRef(tab);

  const selectTab = (next: GatewayPanelTabId) => {
    if (next === tab) return;
    setTabDirection(resolveTabSlideDirection(previousTabRef.current, next));
    previousTabRef.current = next;
    setTab(next);
    writeGatewayPanelTab(next);
  };

  const tabPaneClassName =
    tab === 'logs'
      ? 'panel-tab-content flex h-full min-h-0 flex-col overflow-hidden p-4'
      : 'panel-tab-content overflow-y-auto p-4';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GatewayPanelTabs
        active={tab}
        gateway={gateway}
        connected={connected}
        connecting={connecting}
        onRefresh={onRefresh}
        onChange={selectTab}
      />

      {!connected && (
        <div className="px-4 pt-3">
          <DisconnectedBanner status={gateway.connectionStatus} reconnectAt={gateway.reconnectAt} />
        </div>
      )}

      <div className="panel-tab-viewport min-h-0 flex-1">
        <PanelTabTransition tab={tab} direction={tabDirection} className={tabPaneClassName}>
          {tab === 'devices' && (
            <DeviceInventoryTable gateway={gateway} connected={connected} embedded users={users} onRefresh={onRefresh} />
          )}

          {tab === 'connection' && (
            <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
              <ConnectionStatus gateway={gateway} embedded />
              <StateControls gateway={gateway} connected={connected} embedded onChange={onRefresh} />
            </div>
          )}

          {tab === 'behavior' && (
            <div className="mx-auto max-w-2xl">
              <BehaviorConfigPanel gateway={gateway} connected={connected} embedded onChange={onRefresh} />
            </div>
          )}

          {tab === 'settings' && <GatewaySettingsPanel gateway={gateway} onChange={onRefresh} />}

          {tab === 'logs' && <EventLogConsole gateway={gateway} embedded />}
        </PanelTabTransition>
      </div>
    </div>
  );
}
