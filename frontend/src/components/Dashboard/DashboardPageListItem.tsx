import React from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { DashboardPageNameField } from '@/components/Dashboard/DashboardPageNameField';

export interface DashboardPageListItemProps {
  name: string;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  canRemove: boolean;
  onStartRename: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
}

export const DashboardPageListItem: React.FC<DashboardPageListItemProps> = ({
  name,
  index,
  isActive,
  isEditing,
  canRemove,
  onStartRename,
  onCommit,
  onCancel,
  onRemove,
  autoFocus,
  onAutoFocusHandled,
}) => (
  <li
    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
      isActive
        ? 'border-[#147FD4]/40 bg-[#147FD4]/5 dark:bg-[#147FD4]/10'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40'
    }`}
  >
    {isEditing ? (
      <div className="flex-1 min-w-0">
        <DashboardPageNameField
          value={name}
          isEditing
          onStartEdit={() => {}}
          onCommit={onCommit}
          onCancel={onCancel}
          variant="list"
          autoFocus={autoFocus}
          onAutoFocusHandled={onAutoFocusHandled}
          placeholder={`Page ${index + 1}`}
        />
      </div>
    ) : (
      <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">
        {name}
      </span>
    )}

    {isActive && !isEditing && (
      <span className="text-xs font-normal text-[#147FD4] flex-shrink-0">Current</span>
    )}

    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
      {!isEditing && (
        <button
          type="button"
          onClick={onStartRename}
          className="p-1.5 rounded-md text-gray-500 hover:text-[#147FD4] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={`Rename ${name}`}
          title="Rename page"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </button>
      )}
      {canRemove && onRemove && !isEditing && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          aria-label={`Remove ${name}`}
          title="Remove page"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  </li>
);
