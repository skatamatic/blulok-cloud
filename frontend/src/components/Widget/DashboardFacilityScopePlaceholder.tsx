import React from 'react';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import {
  DASHBOARD_SELECT_FACILITY_MESSAGE,
  DASHBOARD_SELECT_FACILITY_TITLE,
} from '@/constants/dashboard-facility-scope.constants';

type DashboardFacilityScopePlaceholderProps = {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  message?: string;
};

export const DashboardFacilityScopePlaceholder: React.FC<DashboardFacilityScopePlaceholderProps> = ({
  icon: Icon = BuildingOffice2Icon,
  title = DASHBOARD_SELECT_FACILITY_TITLE,
  message = DASHBOARD_SELECT_FACILITY_MESSAGE,
}) => (
  <div className="flex h-full flex-col items-center justify-center px-4 text-center">
    <div className="mb-3 rounded-full bg-[#147FD4]/10 p-3 dark:bg-[#147FD4]/20">
      <Icon className="h-7 w-7 text-[#147FD4]" />
    </div>
    <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
    <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">{message}</p>
  </div>
);
