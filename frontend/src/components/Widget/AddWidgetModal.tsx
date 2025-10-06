import React from 'react';
import { Modal } from '@/components/Modal/Modal';
// import { WidgetType } from '@/types/widget-management.types';
import { getAvailableWidgets } from '@/config/widgetRegistry';
import { PlusIcon } from '@heroicons/react/24/outline';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (widgetType: string) => void;
  existingWidgets: string[];
  maxWidgets: number;
}

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({
  isOpen,
  onClose,
  onAddWidget,
  existingWidgets,
  maxWidgets
}) => {
  const availableWidgets = getAvailableWidgets().filter(widget => {
    // If widget doesn't allow multiple instances, check if it already exists
    if (!widget.allowMultiple) {
      return !existingWidgets.some(existingType => existingType === widget.type);
    }
    return true;
  });

  const handleAddWidget = (widgetType: string) => {
    if (existingWidgets.length >= maxWidgets) {
      return; // Should not happen due to UI restrictions
    }
    onAddWidget(widgetType);
    onClose();
  };

  const canAddMore = existingWidgets.length < maxWidgets;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Widget" size="xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose a widget to add to your dashboard
          </p>
        </div>

        {/* Widget Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-96 overflow-y-auto">
          {availableWidgets.map((widget) => {
            const Icon = widget.icon;
            const isDisabled = !canAddMore;
            
            return (
              <button
                key={widget.type}
                onClick={() => !isDisabled && handleAddWidget(widget.type)}
                disabled={isDisabled}
                className={`group p-6 rounded-xl border text-left transition-all duration-200 ${
                  isDisabled
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer hover:-translate-y-0.5'
                }`}
              >
                <div className="flex flex-col space-y-4">
                  <div className="flex items-start justify-between">
                    <div className={`flex-shrink-0 p-3 rounded-lg transition-colors ${
                      isDisabled 
                        ? 'bg-gray-100 dark:bg-gray-700' 
                        : 'bg-primary-100 dark:bg-primary-900/50 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/70'
                    }`}>
                      <Icon className={`h-6 w-6 ${
                        isDisabled 
                          ? 'text-gray-400 dark:text-gray-500' 
                          : 'text-primary-600 dark:text-primary-400'
                      }`} />
                    </div>
                    {!isDisabled && (
                      <PlusIcon className="h-5 w-5 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" />
                    )}
                  </div>
                  <div>
                    <h3 className={`text-base font-semibold mb-2 ${
                      isDisabled 
                        ? 'text-gray-400 dark:text-gray-500' 
                        : 'text-gray-900 dark:text-gray-100'
                    }`}>
                      {widget.name}
                    </h3>
                    <p className={`text-sm leading-relaxed ${
                      isDisabled 
                        ? 'text-gray-400 dark:text-gray-500' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {widget.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {availableWidgets.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-300 dark:text-gray-600 mb-4">
              <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              {canAddMore ? 'No more widgets available' : 'Widget limit reached'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {canAddMore 
                ? 'All available widgets have been added to your dashboard'
                : `You've reached the maximum of ${maxWidgets} widgets. Remove a widget to add a new one.`
              }
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
