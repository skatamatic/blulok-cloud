import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Squares2X2Icon, LinkIcon } from '@heroicons/react/24/outline';
import { DashboardTemplateLibrary } from '@/components/Settings/DashboardTemplateLibrary';
import { DashboardAssignmentRules } from '@/components/Settings/DashboardAssignmentRules';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';
import { DashboardAssignmentListItem } from '@/hooks/useDashboardAssignments';

interface DashboardManagementPanelProps {
  templates: SavedDashboardListItem[];
  templatesLoading: boolean;
  templatesError: string | null;
  templatesActionId: string | null;
  assignmentCount?: number;
  onRefreshTemplates: () => void;
  onRenameTemplate: (
    id: string,
    name: string,
    description?: string | null
  ) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<boolean>;
}

export function DashboardManagementPanel({
  templates,
  templatesLoading,
  templatesError,
  templatesActionId,
  assignmentCount,
  onRefreshTemplates,
  onRenameTemplate,
  onDeleteTemplate,
}: DashboardManagementPanelProps) {
  const stats = useMemo(
    () => [
      {
        label: 'Templates',
        value: templatesLoading ? '…' : String(templates.length),
        icon: Squares2X2Icon,
      },
      {
        label: 'Assignment rules',
        value: assignmentCount === undefined ? '…' : String(assignmentCount),
        icon: LinkIcon,
      },
    ],
    [templates.length, templatesLoading, assignmentCount]
  );

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard management</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
          Templates define org-wide layouts. Assignment rules decide which template each role sees.
          Edit layouts on the dashboard, then save or update templates from there.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 max-w-md">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3"
          >
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <stat.icon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">{stat.label}</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <details className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/30 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 list-none flex items-center justify-between">
          How resolution works
          <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <ol className="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-400 list-decimal list-inside">
          <li>Admins with a personal layout see their own edits first</li>
          <li>User-specific assignment (highest priority wins within tier)</li>
          <li>Facility assignment, then all-facilities, then global</li>
          <li>Role defaults if nothing else matches</li>
        </ol>
      </details>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 xl:gap-8">
        <div className="xl:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-5 shadow-sm">
          <DashboardTemplateLibrary
            templates={templates}
            isLoading={templatesLoading}
            error={templatesError}
            actionId={templatesActionId}
            onRefresh={onRefreshTemplates}
            onRename={onRenameTemplate}
            onDelete={onDeleteTemplate}
          />
        </div>
        <div className="xl:col-span-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-5 shadow-sm">
          <DashboardAssignmentRules
            templates={templates}
            templatesLoading={templatesLoading}
          />
        </div>
      </div>
    </div>
  );
}

/** Optional hook helper type for assignment count from parent */
export type { DashboardAssignmentListItem };
