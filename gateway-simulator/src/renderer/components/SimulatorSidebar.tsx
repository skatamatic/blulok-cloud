import { useMemo } from 'react';
import type { GatewayInstanceState, SidebarCatalog } from '@protocol/ipc-channels';
import type { UserInstanceState } from '@protocol/user-simulator-state';
import {
  ArrowPathIcon,
  ChevronDoubleLeftIcon,
  BoltIcon,
  Cog6ToothIcon,
  PlusIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useGatewaySidebarLayout } from '../hooks/useGatewaySidebarLayout';
import { SIDEBAR_COLLAPSED_WIDTH } from '../utils/gateway-sidebar-layout.utils';
import {
  resolveGatewayBindingDisplay,
  sidebarShowsSwapIcon,
  sidebarStatusDotClass,
} from '../utils/gateway-session.utils';
import { groupGatewaysByFacility } from '../utils/gateway-sidebar.utils';

type Props = {
  catalog: SidebarCatalog;
  onCatalogChange: (catalog: SidebarCatalog) => void;
  instances: GatewayInstanceState[];
  users: UserInstanceState[];
  activeGatewayId: string | null;
  activeUserId: string | null;
  onSelectGateway: (id: string) => void;
  onSelectUser: (id: string) => void;
  onAddGateway: () => void;
  onAddUser: () => void;
  onRemoveGateway: (id: string) => void;
  onRemoveUser: (id: string) => void;
  onOpenPreferences: () => void;
};

function GatewayStatusIndicator({
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

function GatewaySidebarGatewayItem({
  gateway,
  isActive,
  collapsed,
  onSelect,
  onRemove,
}: {
  gateway: GatewayInstanceState;
  isActive: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const binding = resolveGatewayBindingDisplay(gateway.connectionStatus, gateway.sessionRole);
  return (
    <div className={`gateway-sidebar-item group ${isActive ? 'gateway-sidebar-item-active' : ''}`}>
      <button
        type="button"
        className="gateway-sidebar-item-main"
        onClick={() => onSelect(gateway.id)}
        aria-current={isActive ? 'page' : undefined}
        title={`${gateway.label} — ${binding.label}`}
        aria-label={`${gateway.label}, ${binding.label}`}
      >
        <span className="gateway-sidebar-status-slot">
          <GatewayStatusIndicator connectionStatus={gateway.connectionStatus} sessionRole={gateway.sessionRole} />
        </span>
        <span className="gateway-sidebar-item-label truncate">{gateway.label}</span>
      </button>
      {!collapsed && (
        <button
          type="button"
          className="gateway-sidebar-item-remove"
          aria-label={`Remove ${gateway.label}`}
          onClick={() => onRemove(gateway.id)}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SimulatorSidebar({
  catalog,
  onCatalogChange,
  instances,
  users,
  activeGatewayId,
  activeUserId,
  onSelectGateway,
  onSelectUser,
  onAddGateway,
  onAddUser,
  onRemoveGateway,
  onRemoveUser,
  onOpenPreferences,
}: Props) {
  const { width, collapsed, resizing, toggleCollapsed, startResize } = useGatewaySidebarLayout();
  const shellWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;
  const gatewayGroups = useMemo(() => groupGatewaysByFacility(instances), [instances]);

  return (
    <div
      className={`gateway-sidebar-shell ${collapsed ? 'gateway-sidebar-shell-collapsed' : ''} ${resizing ? 'gateway-sidebar-shell-resizing' : ''}`}
      style={{ width: shellWidth }}
    >
      <aside className="gateway-sidebar">
        <div className="gateway-sidebar-header">
          <div className="gateway-sidebar-header-copy">
            <span className="gateway-sidebar-title">Simulator</span>
          </div>
          <button
            type="button"
            className="gateway-sidebar-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronDoubleLeftIcon className={`h-4 w-4 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {!collapsed && (
          <div className="catalog-tabs px-3 pt-2">
            <button
              type="button"
              className={`catalog-tab ${catalog === 'gateways' ? 'is-active' : ''}`}
              onClick={() => onCatalogChange('gateways')}
            >
              Gateways <span className="catalog-tab-count">{instances.length}</span>
            </button>
            <button
              type="button"
              className={`catalog-tab ${catalog === 'users' ? 'is-active' : ''}`}
              onClick={() => onCatalogChange('users')}
            >
              Users <span className="catalog-tab-count">{users.length}</span>
            </button>
            <button
              type="button"
              className={`catalog-tab ${catalog === 'webhooks' ? 'is-active' : ''}`}
              onClick={() => onCatalogChange('webhooks')}
            >
              Webhooks
            </button>
          </div>
        )}

        <nav
          className="gateway-sidebar-nav"
          aria-label={
            catalog === 'gateways'
              ? 'Simulated gateways'
              : catalog === 'users'
                ? 'Simulated users'
                : 'FMS webhooks'
          }
        >
          {catalog === 'gateways' &&
            gatewayGroups.map((group) => (
              <section
                key={group.facilityId}
                className="gateway-sidebar-facility-group"
                aria-label={group.facilityLabel}
              >
                {!collapsed && (
                  <h3 className="gateway-sidebar-facility-label" title={group.facilityLabel}>
                    {group.facilityLabel}
                  </h3>
                )}
                {group.gateways.map((g) => (
                  <GatewaySidebarGatewayItem
                    key={g.id}
                    gateway={g}
                    isActive={activeGatewayId === g.id}
                    collapsed={collapsed}
                    onSelect={onSelectGateway}
                    onRemove={onRemoveGateway}
                  />
                ))}
              </section>
            ))}

          {catalog === 'users' &&
            users.map((u) => {
              const isActive = activeUserId === u.id;
              return (
                <div key={u.id} className={`gateway-sidebar-item group ${isActive ? 'gateway-sidebar-item-active' : ''}`}>
                  <button type="button" className="gateway-sidebar-item-main" onClick={() => onSelectUser(u.id)}>
                    <span className="gateway-sidebar-status-slot">
                      <UserIcon className="h-4 w-4 text-primary-500" aria-hidden />
                    </span>
                    <span className="gateway-sidebar-item-label truncate">{u.label}</span>
                    {!collapsed && (
                      <span className="gateway-sidebar-item-meta truncate">{u.loggedIn ? u.role : 'offline'}</span>
                    )}
                  </button>
                  {!collapsed && (
                    <button type="button" className="gateway-sidebar-item-remove" aria-label={`Remove ${u.label}`} onClick={() => onRemoveUser(u.id)}>
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

          {catalog === 'gateways' && !instances.length && (
            <p className="gateway-sidebar-empty">No gateways yet</p>
          )}
          {catalog === 'users' && !users.length && (
            <p className="gateway-sidebar-empty">No users yet</p>
          )}
          {catalog === 'webhooks' && !collapsed && (
            <div className="px-3 py-4 text-center">
              <BoltIcon className="mx-auto mb-2 h-6 w-6 text-primary-500" aria-hidden />
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Simulate FMS webhook deliveries in the main panel. Sign in with an authorized account to load configs.
              </p>
            </div>
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
          {catalog !== 'webhooks' && (
          <button
            type="button"
            onClick={catalog === 'gateways' ? onAddGateway : onAddUser}
            className="gateway-sidebar-add"
            aria-label={catalog === 'gateways' ? 'Add gateway' : 'Import user'}
            title={catalog === 'gateways' ? 'Add gateway' : 'Import user'}
          >
            <PlusIcon className="gateway-sidebar-add-icon h-4 w-4 shrink-0" />
            <span className="gateway-sidebar-add-label">
              {catalog === 'gateways' ? 'Add gateway' : 'Import user'}
            </span>
          </button>
          )}
        </div>
      </aside>
      {!collapsed && (
        <div className="gateway-sidebar-resize-handle" onMouseDown={startResize} role="separator" aria-orientation="vertical" />
      )}
    </div>
  );
}
