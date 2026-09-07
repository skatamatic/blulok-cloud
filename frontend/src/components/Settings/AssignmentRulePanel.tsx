import React, { useEffect, useState } from 'react';
import { UserRole } from '@/types/auth.types';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';
import {
  CreateAssignmentInput,
  DashboardAssignmentListItem,
} from '@/hooks/useDashboardAssignments';
import { SettingsSlidePanel } from '@/components/Settings/SettingsSlidePanel';
import {
  ROLE_LABELS,
  ScopeKind,
  scopeLabel,
  targetLabel,
} from '@/components/Settings/dashboard-assignment.utils';
import { apiService } from '@/services/api.service';

export type AssignmentPanelMode = 'create' | 'edit';

interface AssignmentRulePanelProps {
  open: boolean;
  mode: AssignmentPanelMode;
  templates: SavedDashboardListItem[];
  editItem?: DashboardAssignmentListItem | null;
  onClose: () => void;
  onCreate: (input: CreateAssignmentInput) => Promise<boolean>;
  onUpdate: (
    id: string,
    updates: { savedDashboardId?: string; priority?: number }
  ) => Promise<boolean>;
}

export function AssignmentRulePanel({
  open,
  mode,
  templates,
  editItem,
  onClose,
  onCreate,
  onUpdate,
}: AssignmentRulePanelProps) {
  const isEdit = mode === 'edit' && !!editItem;

  const [savedDashboardId, setSavedDashboardId] = useState('');
  const [scopeKind, setScopeKind] = useState<ScopeKind>('global');
  const [targetRole, setTargetRole] = useState<UserRole>(UserRole.FACILITY_ADMIN);
  const [facilityId, setFacilityId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const [priority, setPriority] = useState(0);
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string }>>([]);
  const [userResults, setUserResults] = useState<
    Array<{ id: string; email: string | null; first_name: string; last_name: string; role?: UserRole }>
  >([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit && editItem) {
      setSavedDashboardId(editItem.savedDashboardId);
      setPriority(editItem.priority);
      return;
    }
    setSavedDashboardId(templates[0]?.id ?? '');
    setScopeKind('global');
    setTargetRole(UserRole.FACILITY_ADMIN);
    setFacilityId('');
    setUserSearch('');
    setUserId('');
    setUserLabel('');
    setPriority(0);
  }, [open, isEdit, editItem, templates]);

  useEffect(() => {
    if (!open || isEdit) return;
    void apiService.getFacilities().then((res) => {
      const list = (res as { facilities?: Array<{ id: string; name: string }> }).facilities ?? [];
      setFacilities(list);
    });
  }, [open, isEdit]);

  useEffect(() => {
    if (isEdit || scopeKind !== 'user' || userSearch.trim().length < 2) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void apiService
        .getUsers({ search: userSearch.trim(), limit: 8 })
        .then((res) => {
          const users = (res as { users?: typeof userResults }).users ?? [];
          setUserResults(users.filter((u) => !u.role || u.role === targetRole));
        })
        .catch(() => setUserResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, scopeKind, targetRole, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!savedDashboardId) return;
    setSubmitting(true);
    try {
      if (isEdit && editItem) {
        const updates: { savedDashboardId?: string; priority?: number } = {};
        if (savedDashboardId !== editItem.savedDashboardId) {
          updates.savedDashboardId = savedDashboardId;
        }
        if (priority !== editItem.priority) {
          updates.priority = priority;
        }
        if (Object.keys(updates).length === 0) {
          onClose();
          return;
        }
        const ok = await onUpdate(editItem.id, updates);
        if (ok) onClose();
        return;
      }

      let input: CreateAssignmentInput;
      if (scopeKind === 'global') {
        input = { savedDashboardId, scope: 'global', targetRole, priority };
      } else if (scopeKind === 'all_facilities') {
        input = { savedDashboardId, scope: 'facility', facilityId: null, targetRole, priority };
      } else if (scopeKind === 'facility') {
        if (!facilityId) return;
        input = { savedDashboardId, scope: 'facility', facilityId, targetRole, priority };
      } else {
        if (!userId) return;
        input = { savedDashboardId, scope: 'user', userId, targetRole, priority };
      }
      const ok = await onCreate(input);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const scopeOptions: Array<{ value: ScopeKind; label: string; hint: string }> = [
    { value: 'global', label: 'Global', hint: 'Applies everywhere for this role' },
    { value: 'all_facilities', label: 'All facilities', hint: 'When viewing all facilities' },
    { value: 'facility', label: 'One facility', hint: 'A specific facility only' },
    { value: 'user', label: 'One user', hint: 'Highest priority override' },
  ];

  return (
    <SettingsSlidePanel
      open={open}
      title={isEdit ? 'Edit assignment rule' : 'New assignment rule'}
      subtitle={
        isEdit
          ? 'Change the template or priority. Scope and target are fixed.'
          : 'Pick who gets which template. User rules beat facility, facility beats global.'
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary rounded-lg">
            Cancel
          </button>
          <button
            type="submit"
            form="assignment-rule-form"
            disabled={submitting || !savedDashboardId}
            className="btn-primary rounded-lg"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      }
    >
      <form id="assignment-rule-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        {isEdit && editItem && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm space-y-1">
            <p className="text-gray-800 dark:text-gray-200">
              <span className="font-medium">Role:</span>{' '}
              {ROLE_LABELS[editItem.targetRole as UserRole] ?? editItem.targetRole}
            </p>
            <p className="text-gray-800 dark:text-gray-200">
              <span className="font-medium">Scope:</span> {scopeLabel(editItem)}
            </p>
            <p className="text-gray-600 dark:text-gray-400">{targetLabel(editItem)}</p>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Template</span>
          <select
            value={savedDashboardId}
            onChange={(e) => setSavedDashboardId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
            required
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {!isEdit && (
          <>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Role</span>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as UserRole)}
                className="mt-1.5 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
              >
                {Object.values(UserRole).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Scope
              </legend>
              <div className="grid grid-cols-1 gap-2">
                {scopeOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      scopeKind === opt.value
                        ? 'border-[#147FD4] bg-[#147FD4]/5 dark:bg-[#147FD4]/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scopeKind"
                      value={opt.value}
                      checked={scopeKind === opt.value}
                      onChange={() => setScopeKind(opt.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">
                        {opt.label}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {opt.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {scopeKind === 'facility' && (
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Facility</span>
                <select
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
                  required
                >
                  <option value="">Select facility…</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {scopeKind === 'user' && (
              <div className="space-y-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Find user
                  </span>
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Name or email"
                    className="mt-1.5 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
                  />
                </label>
                {userResults.length > 0 && (
                  <ul className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                    {userResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setUserId(u.id);
                            setUserLabel(
                              `${u.first_name} ${u.last_name}`.trim() || u.email || u.id
                            );
                            setUserResults([]);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          {u.first_name} {u.last_name}
                          {u.email ? ` · ${u.email}` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {userId && (
                  <p className="text-xs text-[#147FD4] font-medium">Selected: {userLabel}</p>
                )}
              </div>
            )}
          </>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Priority</span>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-24 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Higher wins when multiple rules match the same tier
            </span>
          </div>
        </label>
      </form>
    </SettingsSlidePanel>
  );
}
