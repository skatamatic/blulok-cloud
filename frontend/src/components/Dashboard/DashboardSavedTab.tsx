import React, { useState } from 'react';
import {
  ArrowPathIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';
import { formatDateTime } from '@/utils/datetime.utils';

export interface DashboardSavedTabProps {
  dashboards: SavedDashboardListItem[];
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  actionId: string | null;
  onRefresh: () => void;
  onSaveCurrent: (name: string, description?: string) => Promise<boolean>;
  onUpdateExisting?: (id: string) => Promise<boolean>;
  suggestedUpdateTemplateId?: string;
  onLoad: (id: string) => Promise<boolean>;
  onRename: (id: string, name: string, description?: string | null) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  hideSaveForm?: boolean;
  hideLoadAction?: boolean;
}

export const DashboardSavedTab: React.FC<DashboardSavedTabProps> = ({
  dashboards,
  isLoading,
  error,
  isSaving,
  actionId,
  onRefresh,
  onSaveCurrent,
  onUpdateExisting,
  suggestedUpdateTemplateId,
  onLoad,
  onRename,
  onDelete,
  hideSaveForm = false,
  hideLoadAction = false,
}) => {
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmUpdateId, setConfirmUpdateId] = useState<string | null>(null);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = saveName.trim();
    if (!trimmed) return;
    const ok = await onSaveCurrent(trimmed, saveDescription.trim() || undefined);
    if (ok) {
      setSaveName('');
      setSaveDescription('');
    }
  };

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
    if (ok) {
      setEditingId(null);
    }
  };

  const formatUpdatedAt = (value: string) => formatDateTime(value, value);

  const confirmLoadItem = dashboards.find((d) => d.id === confirmLoadId);
  const confirmDeleteItem = dashboards.find((d) => d.id === confirmDeleteId);
  const confirmUpdateItem = dashboards.find((d) => d.id === confirmUpdateId);

  return (
    <section className="space-y-6">
      {!hideSaveForm && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Save your current working dashboard as a new org-wide template. To overwrite an existing
            template with your current layout, use{' '}
            <span className="font-medium">Update from current</span> on that template below.
          </p>

          <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
            <SaveCurrentFields
              saveName={saveName}
              saveDescription={saveDescription}
              isSaving={isSaving}
              onNameChange={setSaveName}
              onDescriptionChange={setSaveDescription}
            />
          </form>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            Saved library
          </h4>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1 text-xs text-[#147FD4] hover:underline disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        {isLoading && dashboards.length === 0 ? (
          <div className="flex justify-center py-10">
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading saved dashboards…</p>
          </div>
        ) : dashboards.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
            No saved dashboards yet. Save your current layout to create the first template.
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {dashboards.map((item) => (
              <SavedDashboardRow
                key={item.id}
                item={item}
                isEditing={editingId === item.id}
                isBusy={actionId === item.id}
                isUpdating={isSaving && actionId === item.id}
                disableActions={isSaving}
                isAssigned={item.id === suggestedUpdateTemplateId}
                showUpdateAction={!!onUpdateExisting}
                editName={editName}
                editDescription={editDescription}
                onEditNameChange={setEditName}
                onEditDescriptionChange={setEditDescription}
                onStartRename={() => startRename(item)}
                onCancelRename={() => setEditingId(null)}
                onCommitRename={() => void commitRename()}
                onLoad={() => setConfirmLoadId(item.id)}
                onUpdateFromCurrent={() => setConfirmUpdateId(item.id)}
                onDelete={() => setConfirmDeleteId(item.id)}
                hideLoadAction={hideLoadAction}
                formatUpdatedAt={formatUpdatedAt}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={!hideLoadAction && !!confirmLoadId}
        title="Load saved dashboard?"
        message={
          confirmLoadItem
            ? `"${confirmLoadItem.name}" will replace your current working dashboard. This cannot be undone without saving again.`
            : 'This will replace your current working dashboard.'
        }
        confirmLabel="Load"
        onConfirm={() => {
          if (!confirmLoadId) return;
          void onLoad(confirmLoadId).then((ok) => {
            if (ok) setConfirmLoadId(null);
          });
        }}
        onCancel={() => setConfirmLoadId(null)}
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Delete saved dashboard?"
        message={
          confirmDeleteItem
            ? `Remove "${confirmDeleteItem.name}" from the library? This cannot be undone.`
            : 'Remove this saved dashboard from the library?'
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

      <ConfirmDialog
        isOpen={!!confirmUpdateId && !!onUpdateExisting}
        title="Update from current?"
        message={
          confirmUpdateItem
            ? `"${confirmUpdateItem.name}" will be replaced with your current dashboard layout. All assignment rules pointing to this template will serve the updated layout.`
            : 'This will replace the selected template with your current dashboard layout.'
        }
        confirmLabel="Update from current"
        onConfirm={() => {
          if (!confirmUpdateId || !onUpdateExisting) return;
          void onUpdateExisting(confirmUpdateId).then((ok) => {
            if (ok) setConfirmUpdateId(null);
          });
        }}
        onCancel={() => setConfirmUpdateId(null)}
      />
    </section>
  );
};

function SaveCurrentFields({
  saveName,
  saveDescription,
  isSaving,
  onNameChange,
  onDescriptionChange,
}: {
  saveName: string;
  saveDescription: string;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Name</span>
          <input
            type="text"
            value={saveName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={100}
            placeholder="Operations overview"
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Description (optional)
          </span>
          <input
            type="text"
            value={saveDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            maxLength={500}
            placeholder="Brief note for other admins"
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={isSaving || !saveName.trim()}
        className="btn-primary rounded-lg disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Save current dashboard'}
      </button>
    </>
  );
}

interface SavedDashboardRowProps {
  item: SavedDashboardListItem;
  isEditing: boolean;
  isBusy: boolean;
  isUpdating: boolean;
  disableActions: boolean;
  isAssigned: boolean;
  showUpdateAction: boolean;
  editName: string;
  editDescription: string;
  onEditNameChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onLoad: () => void;
  onUpdateFromCurrent: () => void;
  onDelete: () => void;
  hideLoadAction?: boolean;
  formatUpdatedAt: (value: string) => string;
}

function SavedDashboardRow({
  item,
  isEditing,
  isBusy,
  isUpdating,
  disableActions,
  isAssigned,
  showUpdateAction,
  editName,
  editDescription,
  onEditNameChange,
  onEditDescriptionChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onLoad,
  onUpdateFromCurrent,
  onDelete,
  hideLoadAction = false,
  formatUpdatedAt,
}: SavedDashboardRowProps) {
  if (isEditing) {
    return (
      <li className="rounded-xl border border-[#147FD4]/30 bg-[#147FD4]/5 dark:bg-[#147FD4]/10 p-3 space-y-2">
        <input
          type="text"
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          maxLength={100}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={editDescription}
          onChange={(e) => onEditDescriptionChange(e.target.value)}
          maxLength={500}
          placeholder="Description (optional)"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCommitRename}
            disabled={!editName.trim() || isBusy}
            className="text-sm text-[#147FD4] hover:underline disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancelRename}
            className="text-sm text-gray-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {item.name}
          </p>
          {isAssigned && (
            <span className="flex-shrink-0 rounded-md bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Assigned
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
            {item.description}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {item.pageCount} page{item.pageCount === 1 ? '' : 's'} · {item.widgetCount} widget
          {item.widgetCount === 1 ? '' : 's'}
          {item.createdByEmail ? ` · by ${item.createdByEmail}` : ''} · updated{' '}
          {formatUpdatedAt(item.updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        {showUpdateAction && (
          <button
            type="button"
            onClick={onUpdateFromCurrent}
            disabled={isBusy || isUpdating || disableActions}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-[#147FD4]/40 text-[#147FD4] hover:bg-[#147FD4]/10 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? 'Updating…' : 'Update from current'}
          </button>
        )}
        {!hideLoadAction && (
          <button
            type="button"
            onClick={onLoad}
            disabled={isBusy}
            className="btn-primary !px-3 !py-1.5 !text-xs !rounded-lg disabled:opacity-50"
          >
            Load
          </button>
        )}
        <button
          type="button"
          onClick={onStartRename}
          disabled={isBusy}
          title="Rename"
          className="p-1.5 rounded-lg text-gray-500 hover:text-[#147FD4] hover:bg-[#147FD4]/10 disabled:opacity-50"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isBusy}
          title="Delete"
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
