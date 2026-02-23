import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import {
  Cog6ToothIcon,
  BellIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';

import GeneralSettingsTab from './settings/GeneralSettingsTab';
import NotificationsSettingsTab from './settings/NotificationsSettingsTab';
import StorageSettingsTab from './settings/StorageSettingsTab';

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: UserRole;
}

const TABS: SettingsTab[] = [
  { id: 'general', label: 'General', icon: Cog6ToothIcon },
  { id: 'notifications', label: 'Notifications', icon: BellIcon },
  { id: 'storage', label: 'Storage', icon: CircleStackIcon, requiredRole: UserRole.DEV_ADMIN },
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasRole } = useAuth();
  const initialTab = searchParams.get('tab') || 'general';
  const [activeTab, setActiveTab] = useState(initialTab);

  const visibleTabs = TABS.filter(
    (tab) => !tab.requiredRole || hasRole([tab.requiredRole]),
  );

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams(tabId === 'general' ? {} : { tab: tabId }, { replace: true });
  };

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      {/* Left Sidebar Tabs */}
      <nav className="w-56 flex-shrink-0">
        <div className="sticky top-6">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">System Settings</h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Configure your BluLok Cloud instance</p>
          </div>
          <ul className="space-y-1">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => handleTabChange(tab.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150
                      ${isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                      }
                    `}
                  >
                    <tab.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'}`} />
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        {activeTab === 'general' && <GeneralSettingsTab />}
        {activeTab === 'notifications' && <NotificationsSettingsTab />}
        {activeTab === 'storage' && <StorageSettingsTab />}
      </div>
    </div>
  );
}
