import React from 'react';
import { Sidebar } from './Sidebar';
import { useSidebar } from '@/contexts/SidebarContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** When true, main area does not scroll (dashboard fixed viewport). */
  lockViewport?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  lockViewport = false,
}) => {
  const { isCollapsed } = useSidebar();
  
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Sidebar */}
      <div className={`${isCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 transition-all duration-300 ease-in-out`}>
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 min-h-0">
        <main
          className={`flex-1 relative min-h-0 ${
            lockViewport ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'
          }`}
        >
          <div
            className={`${lockViewport ? 'py-3 flex-1 flex flex-col min-h-0' : 'py-6'}`}
          >
            <div
              className={`w-full mx-auto ${
                lockViewport
                  ? 'flex-1 flex flex-col min-h-0 px-4 sm:px-6'
                  : ''
              }`}
              style={lockViewport ? undefined : { paddingLeft: '7%', paddingRight: '7%' }}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
