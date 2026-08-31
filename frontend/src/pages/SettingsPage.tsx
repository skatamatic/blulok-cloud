import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import {
  SunIcon,
  BellIcon,
  CircleStackIcon,
  Squares2X2Icon,
  InformationCircleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import {
  canAccessSystemSettings,
  canAccessDashboardSettings,
} from '@/utils/settings-rbac.utils';

import NotificationsSettingsTab from './settings/NotificationsSettingsTab';
import StorageSettingsTab from './settings/StorageSettingsTab';
import DashboardSettingsTab from './settings/DashboardSettingsTab';
import { AppearanceSettingsSection } from './settings/sections/AppearanceSettingsSection';
import { SystemInformationSection } from './settings/sections/SystemInformationSection';
import { SecuritySettingsSection } from './settings/sections/SecuritySettingsSection';

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isVisible: (ctx: {
    role: UserRole | undefined;
    hasRole: (roles: UserRole[]) => boolean;
    isAdmin: () => boolean;
  }) => boolean;
}

const TAB_DEFINITIONS: SettingsTab[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: SunIcon,
    isVisible: ({ role }) => canAccessSystemSettings(role),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Squares2X2Icon,
    isVisible: ({ role }) => canAccessDashboardSettings(role),
  },
  {
    id: 'system-info',
    label: 'System Information',
    icon: InformationCircleIcon,
    isVisible: ({ role }) => canAccessSystemSettings(role),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: BellIcon,
    isVisible: ({ isAdmin }) => isAdmin(),
  },
  {
    id: 'security',
    label: 'Security',
    icon: ShieldCheckIcon,
    isVisible: ({ isAdmin }) => isAdmin(),
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: CircleStackIcon,
    isVisible: ({ hasRole }) => hasRole([UserRole.DEV_ADMIN]),
  },
];

const LEGACY_TAB_ALIASES: Record<string, string> = {
  general: 'appearance',
  dashboards: 'dashboard',
};

function resolveTabId(raw: string | null, visibleIds: string[]): string {
  const normalized = raw ? (LEGACY_TAB_ALIASES[raw] ?? raw) : 'appearance';
  if (visibleIds.includes(normalized)) {
    return normalized;
  }
  return visibleIds[0] ?? 'appearance';
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authState, hasRole, isAdmin } = useAuth();

  const visibleTabs = useMemo(() => {
    const ctx = {
      role: authState.user?.role,
      hasRole,
      isAdmin,
    };
    return TAB_DEFINITIONS.filter((tab) => tab.isVisible(ctx));
  }, [authState.user?.role, hasRole, isAdmin]);

  const visibleTabIds = visibleTabs.map((tab) => tab.id);
  const requestedTab = searchParams.get('tab');
  const resolvedTab = resolveTabId(requestedTab, visibleTabIds);
  const [activeTab, setActiveTab] = useState(resolvedTab);

  useEffect(() => {
    setActiveTab(resolvedTab);
  }, [resolvedTab]);

  useEffect(() => {
    if (!canAccessSystemSettings(authState.user?.role)) {
      return;
    }
    const normalized = requestedTab ? (LEGACY_TAB_ALIASES[requestedTab] ?? requestedTab) : null;
    if (normalized && normalized !== resolvedTab) {
      setSearchParams(
        resolvedTab === 'appearance' ? {} : { tab: resolvedTab },
        { replace: true }
      );
    }
  }, [authState.user?.role, requestedTab, resolvedTab, setSearchParams]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams(tabId === 'appearance' ? {} : { tab: tabId }, { replace: true });
  };

  if (!canAccessSystemSettings(authState.user?.role)) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Access Denied
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You do not have permission to view settings.
        </p>
      </div>
    );
  }

  const pageTitle = isAdmin() ? 'System Settings' : 'Settings';

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      <nav className="w-56 flex-shrink-0">
        <div className="sticky top-6">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{pageTitle}</h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isAdmin()
                ? 'Configure your BluLok Cloud instance'
                : 'Personal preferences and account details'}
            </p>
          </div>
          <ul className="space-y-1">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150
                      ${
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                      }
                    `}
                  >
                    <tab.icon
                      className={`w-5 h-5 flex-shrink-0 ${
                        isActive ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    />
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="flex-1 min-w-0 space-y-8">
        {activeTab === 'appearance' && <AppearanceSettingsSection />}
        {activeTab === 'dashboard' && <DashboardSettingsTab />}
        {activeTab === 'system-info' && <SystemInformationSection />}
        {activeTab === 'notifications' && <NotificationsSettingsTab />}
        {activeTab === 'security' && <SecuritySettingsSection />}
        {activeTab === 'storage' && <StorageSettingsTab />}
      </div>
    </div>
  );
}
