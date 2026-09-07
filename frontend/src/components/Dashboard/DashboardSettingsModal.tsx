import React, { useEffect, useState } from 'react';
import { Tab } from '@headlessui/react';
import { Modal } from '@/components/Modal/Modal';
import { DashboardPagesTab } from '@/components/Dashboard/DashboardPagesTab';
import { DashboardWidgetsTab } from '@/components/Dashboard/DashboardWidgetsTab';
import { DashboardSavedTab } from '@/components/Dashboard/DashboardSavedTab';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';
import { UserRole } from '@/types/auth.types';

export interface DashboardSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (widgetType: string) => void;
  existingWidgets: string[];
  maxWidgets: number;
  role?: UserRole;
  /** Multi-page dashboard (admin/dev_admin) */
  allowPageManagement?: boolean;
  showSavedTab?: boolean;
  pageNames?: string[];
  pageIds?: string[];
  activePageIndex?: number;
  maxPages?: number;
  onAddPage?: () => void | Promise<void>;
  onPageNameCommit?: (index: number, name: string) => void;
  onRemovePage?: (index: number) => void;
  editingPageIndex?: number | null;
  onStartRename?: (index: number) => void;
  onCancelRename?: () => void;
  savedDashboards?: SavedDashboardListItem[];
  savedDashboardsLoading?: boolean;
  savedDashboardsError?: string | null;
  savedDashboardsSaving?: boolean;
  savedDashboardActionId?: string | null;
  onRefreshSavedDashboards?: () => void;
  onSaveCurrentDashboard?: (name: string, description?: string) => Promise<boolean>;
  onUpdateExistingDashboard?: (id: string) => Promise<boolean>;
  suggestedUpdateTemplateId?: string;
  onLoadSavedDashboard?: (id: string) => Promise<boolean>;
  onRenameSavedDashboard?: (
    id: string,
    name: string,
    description?: string | null
  ) => Promise<boolean>;
  onDeleteSavedDashboard?: (id: string) => Promise<boolean>;
  /** Fired when the Saved dashboards tab becomes active or inactive */
  onSavedTabActive?: (active: boolean) => void;
}

export const DashboardSettingsModal: React.FC<DashboardSettingsModalProps> = ({
  isOpen,
  onClose,
  onAddWidget,
  existingWidgets,
  maxWidgets,
  role,
  allowPageManagement = false,
  showSavedTab = false,
  pageNames = [],
  pageIds = [],
  activePageIndex = 0,
  maxPages = 5,
  onAddPage,
  onPageNameCommit,
  onRemovePage,
  editingPageIndex = null,
  onStartRename,
  onCancelRename,
  savedDashboards = [],
  savedDashboardsLoading = false,
  savedDashboardsError = null,
  savedDashboardsSaving = false,
  savedDashboardActionId = null,
  onRefreshSavedDashboards,
  onSaveCurrentDashboard,
  onUpdateExistingDashboard,
  suggestedUpdateTemplateId,
  onLoadSavedDashboard,
  onRenameSavedDashboard,
  onDeleteSavedDashboard,
  onSavedTabActive,
}) => {
  const savedTabReady = Boolean(
    showSavedTab &&
      onRefreshSavedDashboards &&
      onSaveCurrentDashboard &&
      onLoadSavedDashboard &&
      onRenameSavedDashboard &&
      onDeleteSavedDashboard
  );

  const tabs: Array<{ id: string; label: string }> = [];

  if (allowPageManagement) {
    tabs.push({ id: 'pages', label: 'Pages' });
  }
  tabs.push({ id: 'widgets', label: 'Widgets' });
  if (savedTabReady) {
    tabs.push({ id: 'saved', label: 'Saved dashboards' });
  }

  const savedTabIndex = tabs.findIndex((tab) => tab.id === 'saved');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(0);
      onSavedTabActive?.(false);
    }
  }, [isOpen, onSavedTabActive]);

  useEffect(() => {
    onSavedTabActive?.(savedTabIndex >= 0 && selectedIndex === savedTabIndex);
  }, [selectedIndex, savedTabIndex, onSavedTabActive]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dashboard settings" size="xl">
      <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex}>
        {tabs.length > 1 && (
          <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 dark:bg-gray-900/50 p-1 mb-6">
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                className={({ selected }) =>
                  `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all ${
                    selected
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                  }`
                }
              >
                {tab.label}
              </Tab>
            ))}
          </Tab.List>
        )}

        <Tab.Panels>
          {allowPageManagement && (
            <Tab.Panel>
              <DashboardPagesTab
                pageNames={pageNames}
                pageIds={pageIds}
                activePageIndex={activePageIndex}
                maxPages={maxPages}
                editingPageIndex={editingPageIndex}
                onAddPage={onAddPage}
                onPageNameCommit={onPageNameCommit}
                onRemovePage={onRemovePage}
                onStartRename={onStartRename}
                onCancelRename={onCancelRename}
              />
            </Tab.Panel>
          )}

          <Tab.Panel>
            <DashboardWidgetsTab
              role={role}
              existingWidgets={existingWidgets}
              maxWidgets={maxWidgets}
              onAddWidget={onAddWidget}
              onClose={onClose}
            />
          </Tab.Panel>

          {savedTabReady && (
            <Tab.Panel>
              <DashboardSavedTab
                dashboards={savedDashboards}
                isLoading={savedDashboardsLoading}
                error={savedDashboardsError}
                isSaving={savedDashboardsSaving}
                actionId={savedDashboardActionId}
                onRefresh={onRefreshSavedDashboards!}
                onSaveCurrent={onSaveCurrentDashboard!}
                onUpdateExisting={onUpdateExistingDashboard}
                suggestedUpdateTemplateId={suggestedUpdateTemplateId}
                onLoad={onLoadSavedDashboard!}
                onRename={onRenameSavedDashboard!}
                onDelete={onDeleteSavedDashboard!}
              />
            </Tab.Panel>
          )}
        </Tab.Panels>
      </Tab.Group>
    </Modal>
  );
};
