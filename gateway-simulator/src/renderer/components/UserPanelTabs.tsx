import type { ComponentType, SVGProps } from 'react';
import {
  DevicePhoneMobileIcon,
  KeyIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import type { UserInstanceState } from '@protocol/user-simulator-state';
import { EMPTY_APP_REALTIME_STATE } from '@protocol/user-simulator-state';
import {
  USER_PANEL_TABS,
  type UserPanelTabId,
} from '../utils/user-panel.utils';
import { useStackedPanelHeader } from '../hooks/use-stacked-panel-header';
import { UserTabIdentity } from './UserTabIdentity';

type Props = {
  active: UserPanelTabId;
  user: UserInstanceState;
  onChange: (tab: UserPanelTabId) => void;
};

const TAB_ICONS: Record<UserPanelTabId, ComponentType<SVGProps<SVGSVGElement>>> = {
  session: KeyIcon,
  devices: DevicePhoneMobileIcon,
  app: SignalIcon,
};

function tabBadge(tab: UserPanelTabId, user: UserInstanceState): string | null {
  const appRealtime = user.appRealtime ?? EMPTY_APP_REALTIME_STATE;
  switch (tab) {
    case 'devices':
      return user.devices.length ? String(user.devices.length) : null;
    case 'app':
      if (appRealtime.status === 'connected') return 'live';
      if (appRealtime.events.length) return String(appRealtime.events.length);
      return null;
    default:
      return null;
  }
}

export function UserPanelTabs({ active, user, onChange }: Props) {
  const { headerRef, stacked } = useStackedPanelHeader();
  const appRealtime = user.appRealtime ?? EMPTY_APP_REALTIME_STATE;

  return (
    <div
      ref={headerRef}
      className={`gateway-panel-header${stacked ? ' gateway-panel-header-stacked' : ''}`}
    >
      <nav className="panel-tab-bar" aria-label="User panel sections">
        <UserTabIdentity user={user} />

        <div className="panel-tab-row">
          <div className="panel-tab-list" role="tablist">
            {USER_PANEL_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.id];
              const badge = tabBadge(tab.id, user);
              const isActive = active === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`user-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`user-panel-${tab.id}`}
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

          <div className="gateway-toolbar">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                appRealtime.status === 'connected'
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : user.loggedIn
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {appRealtime.status === 'connected'
                ? 'App open'
                : user.loggedIn
                  ? 'Session active'
                  : 'No session'}
            </span>
          </div>
        </div>
      </nav>
    </div>
  );
}
