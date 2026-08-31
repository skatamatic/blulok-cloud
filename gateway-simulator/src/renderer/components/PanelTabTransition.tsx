import type { ReactNode } from 'react';
import {
  GATEWAY_PANEL_TABS,
  type GatewayPanelTabId,
} from '../utils/gateway-panel.utils';

export type TabSlideDirection = 'left' | 'right';

export function resolveOrderedTabSlideDirection(
  order: readonly string[],
  from: string,
  to: string,
): TabSlideDirection {
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return 'right';
  return toIdx > fromIdx ? 'right' : 'left';
}

/** Gateway panel convenience wrapper (kept for existing call sites/tests). */
export function resolveTabSlideDirection(
  from: GatewayPanelTabId,
  to: GatewayPanelTabId,
): TabSlideDirection {
  return resolveOrderedTabSlideDirection(
    GATEWAY_PANEL_TABS.map((tab) => tab.id),
    from,
    to,
  );
}

type Props = {
  tab: string;
  direction: TabSlideDirection;
  /** Prefix for `role=tabpanel` id and matching tab button (`${prefix}-panel-` / `${prefix}-tab-`). */
  idPrefix?: string;
  className?: string;
  children: ReactNode;
};

export function PanelTabTransition({
  tab,
  direction,
  idPrefix = 'gateway',
  className = '',
  children,
}: Props) {
  return (
    <div
      key={tab}
      className={`panel-tab-pane panel-tab-pane-from-${direction} ${className}`.trim()}
      role="tabpanel"
      id={`${idPrefix}-panel-${tab}`}
      aria-labelledby={`${idPrefix}-tab-${tab}`}
    >
      {children}
    </div>
  );
}
