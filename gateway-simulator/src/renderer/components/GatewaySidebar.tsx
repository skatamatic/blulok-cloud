import type { GatewayInstanceState } from '@protocol/ipc-channels';
import {
  ArrowPathIcon,
  ChevronDoubleLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useGatewaySidebarLayout } from '../hooks/useGatewaySidebarLayout';
import { SIDEBAR_COLLAPSED_WIDTH } from '../utils/gateway-sidebar-layout.utils';
import {
  resolveGatewayBindingDisplay,
  sidebarShowsSwapIcon,
  sidebarStatusDotClass,
} from '../utils/gateway-session.utils';

type Props = {
  instances: GatewayInstanceState[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onOpenPreferences: () => void;
};

function SidebarStatusIndicator({
  connectionStatus,
  sessionRole,
}: {
  connectionStatus: GatewayInstanceState['connectionStatus'];
  sessionRole?: GatewayInstanceState['sessionRole'];
}) {
  if (sidebarShowsSwapIcon(connectionStatus, sessionRole)) {
    return <ArrowPathIcon className="gateway-sidebar-status-icon-swap" aria-hidden />;
  }

  return (
    <span
      className={`gateway-sidebar-status-dot ${sidebarStatusDotClass(connectionStatus, sessionRole)}`}
      aria-hidden
    />
  );
}

export function GatewaySidebar({ instances, activeId, onSelect, onAdd, onRemove, onOpenPreferences }: Props) {
  const { width, collapsed, resizing, toggleCollapsed, startResize } = useGatewaySidebarLayout();
  const shellWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

  return (
    <div
      className={`gateway-sidebar-shell ${collapsed ? 'gateway-sidebar-shell-collapsed' : ''} ${resizing ? 'gateway-sidebar-shell-resizing' : ''}`}
      style={{ width: shellWidth }}
    >
      <aside className="gateway-sidebar">
        <div className="gateway-sidebar-header">
          <div className="gateway-sidebar-header-copy">
            <span className="gateway-sidebar-title">Gateways</span>
            <span className="gateway-sidebar-count">{instances.length}</span>
          </div>
          <button
            type="button"
            className="gateway-sidebar-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand gateway sidebar' : 'Collapse gateway sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className={`gateway-sidebar-collapse-icon ${collapsed ? 'is-collapsed' : ''}`} aria-hidden>
              <ChevronDoubleLeftIcon className="h-4 w-4" />
            </span>
          </button>
        </div>

        <nav className="gateway-sidebar-nav" aria-label="Simulated gateways">
          {instances.map((g) => {
            const isActive = activeId === g.id;
            const binding = resolveGatewayBindingDisplay(g.connectionStatus, g.sessionRole);
            return (
              <div
                key={g.id}
                className={`gateway-sidebar-item group ${isActive ? 'gateway-sidebar-item-active' : ''}`}
              >
                <button
                  type="button"
                  className="gateway-sidebar-item-main"
                  onClick={() => onSelect(g.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={`${g.label} — ${binding.label}`}
                  aria-label={`${g.label}, ${binding.label}`}
                >
                  <span className="gateway-sidebar-status-slot">
                    <SidebarStatusIndicator
                      connectionStatus={g.connectionStatus}
                      sessionRole={g.sessionRole}
                    />
                  </span>
                  <span className="gateway-sidebar-item-label">{g.label}</span>
                </button>
                <button
                  type="button"
                  className="gateway-sidebar-item-remove"
                  aria-label={`Remove ${g.label}`}
                  tabIndex={collapsed ? -1 : 0}
                  onClick={() => onRemove(g.id)}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {!instances.length && (
            <p className="gateway-sidebar-empty">No gateways yet</p>
          )}
        </nav>

        <div className="gateway-sidebar-footer">
          <button
            type="button"
            onClick={onOpenPreferences}
            className="gateway-sidebar-preferences"
            aria-label="Preferences"
            title="Preferences"
          >
            <Cog6ToothIcon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="gateway-sidebar-preferences-label">Preferences</span>
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="gateway-sidebar-add"
            aria-label="Add gateway"
            title="Add gateway"
          >
            <PlusIcon className="gateway-sidebar-add-icon h-4 w-4 shrink-0" />
            <span className="gateway-sidebar-add-label">Add gateway</span>
          </button>
        </div>
      </aside>

      <div
        className="gateway-sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-hidden={collapsed}
        aria-label="Resize gateway sidebar"
        onMouseDown={startResize}
      />
    </div>
  );
}
