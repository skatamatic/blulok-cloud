import React from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { DashboardPageListItem } from '@/components/Dashboard/DashboardPageListItem';

export interface DashboardPagesTabProps {
  pageNames: string[];
  pageIds: string[];
  activePageIndex: number;
  maxPages: number;
  editingPageIndex: number | null;
  onAddPage?: () => void | Promise<void>;
  onPageNameCommit?: (index: number, name: string) => void;
  onRemovePage?: (index: number) => void;
  onStartRename?: (index: number) => void;
  onCancelRename?: () => void;
}

export const DashboardPagesTab: React.FC<DashboardPagesTabProps> = ({
  pageNames,
  pageIds,
  activePageIndex,
  maxPages,
  editingPageIndex,
  onAddPage,
  onPageNameCommit,
  onRemovePage,
  onStartRename,
  onCancelRename,
}) => (
  <section>
    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
      Add pages here; use Rename to edit a name. When you have more than one page,
      switch with the dots above the dashboard.
    </p>
    <ul className="space-y-2">
      {pageNames.map((name, index) => (
        <DashboardPageListItem
          key={pageIds[index] ?? `page-${index}`}
          name={name}
          index={index}
          isActive={index === activePageIndex}
          isEditing={editingPageIndex === index}
          canRemove={!!onRemovePage && pageNames.length > 1}
          onStartRename={() => onStartRename?.(index)}
          onCommit={(next) => onPageNameCommit?.(index, next)}
          onCancel={() => onCancelRename?.()}
          onRemove={onRemovePage ? () => onRemovePage(index) : undefined}
          autoFocus={editingPageIndex === index}
        />
      ))}
    </ul>
    {onAddPage && pageNames.length < maxPages && (
      <button
        type="button"
        onClick={() => void onAddPage()}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#147FD4] hover:underline"
      >
        <PlusIcon className="h-4 w-4" />
        Add page
      </button>
    )}
  </section>
);
