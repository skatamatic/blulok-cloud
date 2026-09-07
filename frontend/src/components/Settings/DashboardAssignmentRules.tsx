import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowPathIcon,
  FunnelIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';
import {
  useDashboardAssignments,
  DashboardAssignmentListItem,
} from '@/hooks/useDashboardAssignments';
import { UserRole } from '@/types/auth.types';
import { AssignmentRulePanel } from '@/components/Settings/AssignmentRulePanel';
import {
  AssignmentFilter,
  ROLE_LABELS,
  SCOPE_FILTER_OPTIONS,
  assignmentScopeKind,
  scopeBadgeClass,
  scopeLabel,
  targetLabel,
} from '@/components/Settings/dashboard-assignment.utils';

interface DashboardAssignmentRulesProps {
  templates: SavedDashboardListItem[];
  templatesLoading: boolean;
}

export function DashboardAssignmentRules({
  templates,
  templatesLoading,
}: DashboardAssignmentRulesProps) {
  const {
    assignments,
    isLoading,
    error,
    actionId,
    refresh,
    createAssignment,
    updateAssignment,
    deleteAssignment,
  } = useDashboardAssignments({ enabled: true });

  const [filter, setFilter] = useState<AssignmentFilter>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<DashboardAssignmentListItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return assignments;
    return assignments.filter((a) => assignmentScopeKind(a) === filter);
  }, [assignments, filter]);

  const confirmDeleteItem = assignments.find((a) => a.id === confirmDeleteId);

  const openCreate = () => {
    setPanelMode('create');
    setEditItem(null);
    setPanelOpen(true);
  };

  const openEdit = (item: DashboardAssignmentListItem) => {
    setPanelMode('edit');
    setEditItem(item);
    setPanelOpen(true);
  };

  return (
    <section className="flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Assignment rules</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-md">
            Map templates to roles and scopes. User overrides beat facility rules, which beat global.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#147FD4] hover:bg-[#147FD4]/10 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={templatesLoading || templates.length === 0}
            className="btn-primary !px-3 !py-1.5 !text-xs !rounded-lg gap-1.5 shadow-sm disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add rule
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <FunnelIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as AssignmentFilter)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
        >
          {SCOPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {filtered.length} of {assignments.length}
        </span>
      </div>

      {templates.length === 0 && !templatesLoading && (
        <p className="text-sm text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 mb-4">
          Create a template first — add one from the dashboard, then return here to assign it.
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      {isLoading && assignments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading rules…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {assignments.length === 0 ? 'No assignment rules yet' : 'No rules match this filter'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            {assignments.length === 0
              ? 'Add a rule to control which dashboard each role sees.'
              : 'Try a different scope filter.'}
          </p>
          {assignments.length === 0 && templates.length > 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="btn-primary mt-4 gap-1.5 rounded-lg"
            >
              <PlusIcon className="h-4 w-4" />
              Add first rule
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto max-h-[min(70vh,640px)] pr-1">
          {filtered.map((row, index) => {
            const kind = assignmentScopeKind(row);
            return (
              <motion.li
                key={row.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 hover:border-[#147FD4]/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {ROLE_LABELS[row.targetRole as UserRole] ?? row.targetRole}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${scopeBadgeClass(kind)}`}
                      >
                        {scopeLabel(row)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Priority {row.priority}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {row.savedDashboardName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {targetLabel(row)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      disabled={actionId === row.id}
                      title="Edit rule"
                      className="p-1.5 rounded-lg text-[#147FD4] hover:bg-[#147FD4]/10 disabled:opacity-50 transition-colors"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(row.id)}
                      disabled={actionId === row.id}
                      title="Remove rule"
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <AssignmentRulePanel
        open={panelOpen}
        mode={panelMode}
        templates={templates}
        editItem={editItem}
        onClose={() => {
          setPanelOpen(false);
          setEditItem(null);
        }}
        onCreate={createAssignment}
        onUpdate={updateAssignment}
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Remove assignment rule?"
        message={
          confirmDeleteItem
            ? `Users matching this rule will fall back to the next applicable assignment or default layout.`
            : 'Remove this assignment rule?'
        }
        confirmLabel="Remove"
        confirmTone="danger"
        onConfirm={() => {
          if (!confirmDeleteId) return;
          void deleteAssignment(confirmDeleteId).then((ok) => {
            if (ok) setConfirmDeleteId(null);
          });
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </section>
  );
}
