import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowPathIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';

interface DashboardTemplateLibraryProps {
  templates: SavedDashboardListItem[];
  isLoading: boolean;
  error: string | null;
  actionId: string | null;
  onRefresh: () => void;
  onRename: (id: string, name: string, description?: string | null) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function DashboardTemplateLibrary({
  templates,
  isLoading,
  error,
  actionId,
  onRefresh,
  onRename,
  onDelete,
}: DashboardTemplateLibraryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const confirmDeleteItem = templates.find((t) => t.id === confirmDeleteId);

  const startRename = (item: SavedDashboardListItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description ?? '');
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    const ok = await onRename(editingId, trimmed, editDescription.trim() || null);
    if (ok) setEditingId(null);
  };

  const formatUpdatedAt = (value: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
    } catch {
      return value;
    }
  };

  return (
    <section className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Templates</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Org-wide layouts. Edit on the{' '}
            <Link to="/dashboard" className="text-[#147FD4] hover:underline font-medium">
              dashboard
            </Link>{' '}
            then save or update here.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#147FD4] hover:bg-[#147FD4]/10 disabled:opacity-50 transition-colors"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      {isLoading && templates.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading templates…</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/30 px-6 py-10 text-center">
          <Squares2X2Icon className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">No templates yet</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
            Open the dashboard settings modal and save your layout as a new template.
          </p>
          <Link
            to="/dashboard"
            className="btn-primary mt-4 gap-1.5 rounded-lg"
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto max-h-[min(70vh,640px)] pr-1">
          {templates.map((item, index) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`rounded-xl border transition-colors ${
                editingId === item.id
                  ? 'border-[#147FD4]/40 bg-[#147FD4]/5 dark:bg-[#147FD4]/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 hover:border-[#147FD4]/30'
              }`}
            >
              {editingId === item.id ? (
                <div className="p-3 space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    maxLength={500}
                    placeholder="Description (optional)"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void commitRename()}
                      disabled={!editName.trim() || actionId === item.id}
                      className="text-sm font-medium text-[#147FD4] hover:underline disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                      {item.pageCount} page{item.pageCount === 1 ? '' : 's'} · {item.widgetCount}{' '}
                      widget{item.widgetCount === 1 ? '' : 's'}
                      {item.updatedAt ? ` · ${formatUpdatedAt(item.updatedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startRename(item)}
                      disabled={actionId === item.id}
                      title="Rename"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-[#147FD4] hover:bg-[#147FD4]/10 disabled:opacity-50 transition-colors"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      disabled={actionId === item.id}
                      title="Delete"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Delete template?"
        message={
          confirmDeleteItem
            ? `Remove "${confirmDeleteItem.name}"? Assignments using this template must be updated first.`
            : 'Remove this template from the library?'
        }
        confirmLabel="Delete"
        confirmTone="danger"
        onConfirm={() => {
          if (!confirmDeleteId) return;
          void onDelete(confirmDeleteId).then((ok) => {
            if (ok) setConfirmDeleteId(null);
          });
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </section>
  );
}
