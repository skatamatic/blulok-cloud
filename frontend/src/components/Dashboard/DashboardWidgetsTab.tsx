import React from 'react';
import { getAvailableWidgets } from '@/config/widgetRegistry';
import { filterWidgetsByRole } from '@/utils/rbac.utils';
import { UserRole } from '@/types/auth.types';

export interface DashboardWidgetsTabProps {
  role?: UserRole;
  existingWidgets: string[];
  maxWidgets: number;
  onAddWidget: (widgetType: string) => void;
  onClose: () => void;
}

export const DashboardWidgetsTab: React.FC<DashboardWidgetsTabProps> = ({
  role,
  existingWidgets,
  maxWidgets,
  onAddWidget,
  onClose,
}) => {
  const availableWidgets = filterWidgetsByRole(
    getAvailableWidgets().filter((widget) => {
      if (!widget.allowMultiple) {
        return !existingWidgets.some((existingType) => existingType === widget.type);
      }
      return true;
    }),
    role
  );

  const canAddMore = existingWidgets.length < maxWidgets;

  const handleAddWidget = (widgetType: string) => {
    if (!canAddMore) return;
    onAddWidget(widgetType);
    onClose();
  };

  return (
    <section>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Choose a widget to add to the current page
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-1">
        {availableWidgets.map((widget) => {
          const Icon = widget.icon;
          const isDisabled = !canAddMore;

          return (
            <button
              key={widget.type}
              type="button"
              onClick={() => !isDisabled && handleAddWidget(widget.type)}
              disabled={isDisabled}
              className={`group p-4 rounded-xl border text-left transition-all duration-200 ${
                isDisabled
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:border-[#147FD4]/40 dark:hover:border-[#147FD4]/50 hover:bg-[#147FD4]/5 dark:hover:bg-[#147FD4]/10 cursor-pointer'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 p-2 rounded-lg ${
                    isDisabled
                      ? 'bg-gray-100 dark:bg-gray-700'
                      : 'bg-[#147FD4]/10 dark:bg-[#147FD4]/20'
                  }`}
                >
                  <Icon className="h-5 w-5 text-[#147FD4]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {widget.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                    {widget.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!canAddMore && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          This page is full ({maxWidgets} widgets max). Remove a widget or switch pages to
          add more.
        </p>
      )}
    </section>
  );
};
