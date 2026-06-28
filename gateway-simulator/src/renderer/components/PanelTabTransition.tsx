import type { ReactNode } from 'react';
import {
  GATEWAY_PANEL_TABS,
  type GatewayPanelTabId,
} from '../utils/gateway-panel.utils';

export type TabSlideDirection = 'left' | 'right';

export function resolveTabSlideDirection(
  from: GatewayPanelTabId,
  to: GatewayPanelTabId,
): TabSlideDirection {
  const fromIdx = GATEWAY_PANEL_TABS.findIndex((tab) => tab.id === from);
  const toIdx = GATEWAY_PANEL_TABS.findIndex((tab) => tab.id === to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return 'right';
  return toIdx > fromIdx ? 'right' : 'left';
}

type Props = {
  tab: GatewayPanelTabId;
  direction: TabSlideDirection;
  className?: string;
  children: ReactNode;
};

export function PanelTabTransition({ tab, direction, className = '', children }: Props) {
  return (
    <div
      key={tab}
      className={`panel-tab-pane panel-tab-pane-from-${direction} ${className}`.trim()}
      role="tabpanel"
      id={`gateway-panel-${tab}`}
      aria-labelledby={`gateway-tab-${tab}`}
    >
      {children}
    </div>
  );
}
