import type { ComponentType, SVGProps } from 'react';
import {
  DevicePhoneMobileIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import type { UserInstanceState } from '@protocol/user-simulator-state';
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
};

function tabBadge(tab: UserPanelTabId, user: UserInstanceState): string | null {
  if (tab === 'devices' && user.devices.length) {
    return String(user.devices.length);
  }
  return null;
}

export function UserPanelTabs({ active, user, onChange }: Props) {
  useStackedPanelHeader();

  return (
    <div className="border-b border-slate-800 bg-slate-950/80 px-3 pt-2">
      <UserTabIdentity user={user} />
      <div className="mt-2 flex gap-1" role="tablist" aria-label="User panel sections">
        {USER_PANEL_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const selected = active === tab.id;
          const badge = tabBadge(tab.id, user);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={tab.hint}
              onClick={() => onChange(tab.id)}
              className={[
                'inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors',
                selected
                  ? 'bg-slate-900 text-sky-300'
                  : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{tab.label}</span>
              {badge ? (
                <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
