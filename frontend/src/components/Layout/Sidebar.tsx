import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useBluFMSDemo } from '@/contexts/BluFMSDemoContext';
import { useBluFMSFacility } from '@/contexts/BluFMSFacilityContext';
import { useBluDesign } from '@/contexts/BluDesignContext';
import { UserRole } from '@/types/auth.types';
import { ChangePasswordModal } from '@/components/UserManagement/ChangePasswordModal';
import { CompactFacilityDropdown } from '@/components/Common/CompactFacilityDropdown';
import {
  HomeIcon,
  UsersIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  LockClosedIcon,
  Bars3Icon,
  ChevronLeftIcon,
  ChevronDownIcon,
  SquaresPlusIcon,
  ComputerDesktopIcon,
  KeyIcon,
  ClockIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  PresentationChartLineIcon,
  CloudIcon,
  MapIcon,
  WrenchScrewdriverIcon,
  PhotoIcon,
  PencilSquareIcon,
  EyeIcon
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

const bluLokNavigation: NavItem[] = [
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

const bluFMSNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/blufms/dashboard', icon: PresentationChartLineIcon },
  { 
    name: 'Facility Map', 
    href: '/blufms/facility-map', 
    icon: MapIcon,
    roles: [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]
  },
];

const bluDesignNavigation: NavItem[] = [
  { name: 'View', href: '/bludesign/view', icon: EyeIcon },
  { name: 'Build', href: '/bludesign/build', icon: WrenchScrewdriverIcon },
  { name: 'Assets', href: '/bludesign/assets', icon: PhotoIcon },
  { name: 'Configuration', href: '/bludesign/config', icon: Cog6ToothIcon },
];

export const Sidebar: React.FC = () => {
  const { authState, logout, hasRole, isAdmin, canManageUsers } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { isBluFMSDemoEnabled, isLoading: isBluFMSLoading } = useBluFMSDemo();
  const { isBluDesignEnabled, isLoading: isBluDesignLoading } = useBluDesign();
  const navigate = useNavigate();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [bluLokExpanded, setBluLokExpanded] = useState(true);
  const [bluFMSExpanded, setBluFMSExpanded] = useState(false);
  const [bluDesignExpanded, setBluDesignExpanded] = useState(false);
  
  // Don't show sections while loading (defaults to false/disabled)
  const showBluFMSDemo = !isBluFMSLoading && isBluFMSDemoEnabled;
  const showBluDesign = !isBluDesignLoading && isBluDesignEnabled;
  
  // If either BluFMS or BluDesign is enabled, use expandable sections
  const useExpandableSections = showBluFMSDemo || showBluDesign;
  
  // Get BluFMS facility context (returns safe defaults if provider not mounted)
  const bluFMSFacilityContext = useBluFMSFacility();

  // Handle mutual exclusivity - when one expands, the others collapse
  const handleBluLokToggle = () => {
    if (!bluLokExpanded) {
      setBluLokExpanded(true);
      setBluFMSExpanded(false);
      setBluDesignExpanded(false);
    } else {
      setBluLokExpanded(false);
    }
  };

  const handleBluFMSToggle = () => {
    if (!bluFMSExpanded) {
      setBluFMSExpanded(true);
      setBluLokExpanded(false);
      setBluDesignExpanded(false);
    } else {
      setBluFMSExpanded(false);
    }
  };

  const handleBluDesignToggle = () => {
    if (!bluDesignExpanded) {
      setBluDesignExpanded(true);
      setBluLokExpanded(false);
      setBluFMSExpanded(false);
    } else {
      setBluDesignExpanded(false);
    }
  };
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

      {/* Navigation - scrollbar hidden but still scrollable */}
      <nav className="flex-1 px-2 py-6 space-y-1 scrollbar-hide">
        {useExpandableSections ? (
          // Collapsible sections when BluFMS or BluDesign is enabled
          <>
            {/* BluLok Section */}
            <div className="space-y-1">
              {/* Section Header - Always visible, adapts to collapsed state */}
              <button
                onClick={handleBluLokToggle}
                className={`w-full flex items-center ${
                  isCollapsed 
                    ? 'justify-center px-2 py-2.5' 
                    : 'justify-between px-2 py-2'
                } text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-all duration-200 ${
                  isCollapsed ? 'border border-gray-200 dark:border-gray-700' : ''
                }`}
                title={isCollapsed ? 'BluLok' : undefined}
              >
                {isCollapsed ? (
                  <LockClosedIcon className={`h-5 w-5 transition-colors duration-300 ease-out ${
                    bluLokExpanded ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                  }`} />
                ) : (
                  <>
                    <span>BluLok</span>
                    <ChevronDownIcon 
                      className={`h-4 w-4 transition-transform duration-300 ease-out ${
                        bluLokExpanded ? 'transform rotate-180' : ''
                      }`}
                    />
                  </>
                )}
              </button>
              <div 
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  bluLokExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-1">
                  {bluLokNavigation.filter(canAccessItem).map((item) => (
                    <div key={item.name}>
                      {item.isCategory ? (
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
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className={`my-2 border-t border-gray-200 dark:border-gray-700 transition-opacity duration-300 ${
              isCollapsed ? 'opacity-50' : 'opacity-100'
            }`}></div>

            {/* BluFMS Section */}
            <div className="space-y-1">
              {/* Section Header - Always visible, adapts to collapsed state */}
              <button
                onClick={handleBluFMSToggle}
                className={`w-full flex items-center ${
                  isCollapsed 
                    ? 'justify-center px-2 py-2.5' 
                    : 'justify-between px-2 py-2'
                } text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-all duration-200 ${
                  isCollapsed ? 'border border-gray-200 dark:border-gray-700' : ''
                }`}
                title={isCollapsed ? 'BluFMS' : undefined}
              >
                {isCollapsed ? (
                  <CloudIcon className={`h-5 w-5 transition-colors duration-300 ease-out ${
                    bluFMSExpanded ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                  }`} />
                ) : (
                  <>
                    <span>BluFMS</span>
                    <ChevronDownIcon 
                      className={`h-4 w-4 transition-transform duration-300 ease-out ${
                        bluFMSExpanded ? 'transform rotate-180' : ''
                      }`}
                    />
                  </>
                )}
              </button>
              <div 
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  bluFMSExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-1">
                  {/* Facility Selector - Only show if multiple facilities and sidebar expanded */}
                  {!isCollapsed && showBluFMSDemo && bluFMSFacilityContext.hasMultipleFacilities && !bluFMSFacilityContext.isLoading && (
                    <div className="px-2 py-1.5">
                      <CompactFacilityDropdown
                        facilities={bluFMSFacilityContext.facilities}
                        selectedFacilityId={bluFMSFacilityContext.selectedFacilityId || ''}
                        onSelect={(id) => bluFMSFacilityContext.setSelectedFacilityId(id)}
                        placeholder="Select facility"
                        className="w-full"
                      />
                    </div>
                  )}
                  
                  {bluFMSNavigation.filter(canAccessItem).map((item) => (
                    <NavLink
                      key={item.name}
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
                  ))}
                </div>
              </div>
            </div>

            {/* BluDesign Section - Only show if enabled */}
            {showBluDesign && (
              <>
                {/* Separator */}
                <div className={`my-2 border-t border-gray-200 dark:border-gray-700 transition-opacity duration-300 ${
                  isCollapsed ? 'opacity-50' : 'opacity-100'
                }`}></div>

                {/* BluDesign Section */}
                <div className="space-y-1">
                  {/* Section Header - Always visible, adapts to collapsed state */}
                  <button
                    onClick={handleBluDesignToggle}
                    className={`w-full flex items-center ${
                      isCollapsed 
                        ? 'justify-center px-2 py-2.5' 
                        : 'justify-between px-2 py-2'
                    } text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-all duration-200 ${
                      isCollapsed ? 'border border-gray-200 dark:border-gray-700' : ''
                    }`}
                    title={isCollapsed ? 'BluDesign' : undefined}
                  >
                    {isCollapsed ? (
                      <PencilSquareIcon className={`h-5 w-5 transition-colors duration-300 ease-out ${
                        bluDesignExpanded ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                      }`} />
                    ) : (
                      <>
                        <span>BluDesign</span>
                        <ChevronDownIcon 
                          className={`h-4 w-4 transition-transform duration-300 ease-out ${
                            bluDesignExpanded ? 'transform rotate-180' : ''
                          }`}
                        />
                      </>
                    )}
                  </button>
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      bluDesignExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="space-y-1">
                      {bluDesignNavigation.filter(canAccessItem).map((item) => (
                        <NavLink
                          key={item.name}
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
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          // Standard navigation when neither BluFMS nor BluDesign is enabled
          bluLokNavigation.filter(canAccessItem).map((item) => (
            <div key={item.name}>
              {item.isCategory && item.name === 'Diagnostics' && !isCollapsed && (
                <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>
              )}
              
              {item.isCategory ? (
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
          ))
        )}
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
