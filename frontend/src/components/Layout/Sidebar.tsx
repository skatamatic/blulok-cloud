import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { UserRole } from '@/types/auth.types';
import { ChangePasswordModal } from '@/components/UserManagement/ChangePasswordModal';
import {
  HomeIcon,
  UsersIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  LockClosedIcon,
  Bars3Icon,
  ChevronLeftIcon,
  SquaresPlusIcon,
  ComputerDesktopIcon,
  KeyIcon,
  ClockIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon
} from '@heroicons/react/24/outline';

interface NavItem {
  name: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
  requireAdmin?: boolean;
  requireUserManagement?: boolean;
  isCategory?: boolean;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Facilities', href: '/facilities', icon: BuildingStorefrontIcon },
  { name: 'Storage Units', href: '/units', icon: SquaresPlusIcon },
  { name: 'Access History', href: '/access-history', icon: ClockIcon },
  { 
    name: 'User Management', 
    href: '/users', 
    icon: UsersIcon,
    requireUserManagement: true
  },
  {
    name: 'System Settings',
    href: '/settings',
    icon: Cog6ToothIcon,
    requireAdmin: true
  },
  {
    name: 'Notification Settings',
    href: '/notification-settings',
    icon: DevicePhoneMobileIcon,
    requireAdmin: true
  },
  { 
    name: 'Diagnostics', 
    isCategory: true,
    roles: [UserRole.ADMIN, UserRole.FACILITY_ADMIN, UserRole.DEV_ADMIN],
    children: [
      { name: 'Device Diagnostics', href: '/devices', icon: ComputerDesktopIcon }
    ]
  },
];

export const Sidebar: React.FC = () => {
  const { authState, logout, hasRole, isAdmin, canManageUsers } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const feInfo = {
    version: (globalThis as any)?.window?.__APP_CONFIG__?.frontendVersion as string | undefined,
    commitShort: ((globalThis as any)?.window?.__APP_CONFIG__?.frontendCommit as string | undefined)?.slice(0,7),
  };

  // No backend info needed for sidebar label; Developer Tools shows full details

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const canAccessItem = (item: NavItem): boolean => {
    if (item.roles && !hasRole(item.roles)) return false;
    if (item.requireAdmin && !isAdmin()) return false;
    if (item.requireUserManagement && !canManageUsers()) return false;
    return true;
  };

  const getRoleBadgeColor = (role: UserRole): string => {
    switch (role) {
      case UserRole.DEV_ADMIN:
        return 'bg-purple-100 text-purple-800';
      case UserRole.ADMIN:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case UserRole.FACILITY_ADMIN:
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      case UserRole.BLULOK_TECHNICIAN:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case UserRole.MAINTENANCE:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case UserRole.TENANT:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const formatRoleName = (role: UserRole): string => {
    switch (role) {
      case UserRole.DEV_ADMIN:
        return 'Dev Admin';
      case UserRole.ADMIN:
        return 'Admin';
      case UserRole.FACILITY_ADMIN:
        return 'Facility Admin';
      case UserRole.BLULOK_TECHNICIAN:
        return 'BluLok Tech';
      case UserRole.MAINTENANCE:
        return 'Maintenance';
      case UserRole.TENANT:
        return 'Tenant';
      default:
        return role;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-colors duration-200">
      {/* Logo and Toggle */}
      <div className={`flex items-center h-16 border-b border-gray-200 dark:border-gray-700 ${
        isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
      }`}>
        {isCollapsed ? (
          // Collapsed state: Only show toggle button centered
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
            title="Expand sidebar"
          >
            <Bars3Icon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
          </button>
        ) : (
          // Expanded state: Show logo and collapse button
          <>
            <div className="flex items-center min-w-0">
              <LockClosedIcon className="h-8 w-8 text-primary-600 flex-shrink-0" />
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white truncate">
                BluLok Cloud
              </span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 flex-shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-6 space-y-1 overflow-y-auto">
        {navigation.filter(canAccessItem).map((item) => (
          <div key={item.name}>
            {/* Add separator before Diagnostics section */}
            {item.isCategory && item.name === 'Diagnostics' && !isCollapsed && (
              <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>
            )}
            
            {item.isCategory ? (
              // Category header with children
              <div className="space-y-1">
                {!isCollapsed && (
                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {item.name}
                  </div>
                )}
                {item.children?.filter(canAccessItem).map((child) => (
                  <NavLink
                    key={child.name}
                    to={child.href!}
                    className={({ isActive }) =>
                      `group flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'px-4 py-2'} text-sm font-medium rounded-md transition-all duration-200 ${
                        isActive
                          ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                      }`
                    }
                    title={isCollapsed ? child.name : undefined}
                  >
                    {child.icon && (
                      <child.icon
                        className={`${isCollapsed ? '' : 'mr-3'} flex-shrink-0 h-5 w-5`}
                        aria-hidden="true"
                      />
                    )}
                    {!isCollapsed && (
                      <span className="truncate">{child.name}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            ) : (
              // Regular navigation item
              <NavLink
                to={item.href!}
                className={({ isActive }) =>
                  `group flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'px-2 py-2'} text-sm font-medium rounded-md transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                  }`
                }
                title={isCollapsed ? item.name : undefined}
              >
                {item.icon && (
                  <item.icon
                    className={`${isCollapsed ? '' : 'mr-3'} flex-shrink-0 h-5 w-5`}
                    aria-hidden="true"
                  />
                )}
                {!isCollapsed && (
                  <span className="truncate">{item.name}</span>
                )}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      {/* Developer Tools - Bottom Section */}
      {hasRole([UserRole.DEV_ADMIN]) && (
        <div className="px-2 pb-2">
          {/* Separator */}
          <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>
          
          {/* Developer Category */}
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-2 py-1 text-xs font-semibold text-green-500 dark:text-green-400 uppercase tracking-wider">
                Developer
              </div>
            )}
            
            <NavLink
              to="/dev-tools"
              className={({ isActive }) =>
                `group flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'px-4 py-2'} text-sm font-medium rounded-md transition-all duration-200 ${
                  isActive
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-100 border border-green-200 dark:border-green-800'
                    : 'text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-800 dark:hover:text-green-100 border border-transparent hover:border-green-200 dark:hover:border-green-800'
                }`
              }
              title={isCollapsed ? 'Developer Tools' : undefined}
            >
              <CodeBracketIcon
                className={`${isCollapsed ? '' : 'mr-3'} flex-shrink-0 h-5 w-5`}
                aria-hidden="true"
              />
              {!isCollapsed && (
                <span className="truncate">Developer Tools</span>
              )}
            </NavLink>
          </div>

          {/* Deployment badge (all users want to see; but place in dev section visually above user card) */}
        </div>
      )}

      {/* User Info */}
      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-gray-200 dark:border-gray-700`}>
        {!isCollapsed && (
          <div className="flex items-center mb-3">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                <span className="text-sm font-medium text-primary-600 dark:text-primary-300">
                  {authState.user?.firstName.charAt(0)}{authState.user?.lastName.charAt(0)}
                </span>
              </div>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {authState.user?.firstName} {authState.user?.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{authState.user?.email}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${getRoleBadgeColor(authState.user?.role || UserRole.TENANT)}`}>
                {formatRoleName(authState.user?.role || UserRole.TENANT)}
              </span>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="flex justify-center mb-3">
            <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              <span className="text-sm font-medium text-primary-600 dark:text-primary-300">
                {authState.user?.firstName.charAt(0)}{authState.user?.lastName.charAt(0)}
              </span>
            </div>
          </div>
        )}

        {/* Change Password */}
        <button
          onClick={() => setShowChangePasswordModal(true)}
          className={`group flex items-center w-full ${isCollapsed ? 'justify-center px-2 py-3' : 'px-2 py-2'} text-sm font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 mb-2`}
          title={isCollapsed ? 'Change password' : undefined}
        >
          <KeyIcon
            className={`${isCollapsed ? '' : 'mr-3'} flex-shrink-0 h-5 w-5`}
            aria-hidden="true"
          />
          {!isCollapsed && 'Change Password'}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`group flex items-center w-full ${isCollapsed ? 'justify-center px-2 py-3' : 'px-2 py-2'} text-sm font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200`}
          title={isCollapsed ? 'Sign out' : undefined}
        >
          <ArrowRightOnRectangleIcon
            className={`${isCollapsed ? '' : 'mr-3'} flex-shrink-0 h-5 w-5`}
            aria-hidden="true"
          />
          {!isCollapsed && 'Sign out'}
        </button>

        {/* Simple version label below Sign Out */}
        {!isCollapsed && (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 font-mono">
            Version: {feInfo.version || 'n/a'}
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        onSuccess={() => {
          // Could show a success message here
        }}
      />
    </div>
  );
};
