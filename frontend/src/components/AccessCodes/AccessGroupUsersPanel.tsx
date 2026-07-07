import { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { UserRole } from '@/types/auth.types';
import { formatRoleName, getRoleBadgeColor } from '@/utils/user-role-display.utils';
import { ACCESS_GROUP_LIST_SCROLL_CLASS, type GroupUserAccess } from '@/components/AccessCodes/access-groups.utils';
import { AccessGroupRowDetailLinks } from '@/components/AccessCodes/AccessGroupRowDetailLinks';

interface AccessGroupUsersPanelProps {
  users: GroupUserAccess[];
  loading: boolean;
  loadError: string | null;
  hasUnitLocks: boolean;
}

const ACCESS_REASON_LABELS: Record<GroupUserAccess['access_reasons'][number], string> = {
  primary_tenant: 'Primary tenant',
  assigned_tenant: 'Assigned tenant',
  shared_key: 'Shared key',
};

const ACCESS_REASON_CLASSES: Record<GroupUserAccess['access_reasons'][number], string> = {
  primary_tenant: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  assigned_tenant: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  shared_key: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
};

function formatUserName(user: GroupUserAccess): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || user.email;
}

function shouldShowRoleBadge(user: GroupUserAccess): boolean {
  if (user.role !== UserRole.TENANT) return true;
  return !user.access_reasons.some(
    (reason) => reason === 'primary_tenant' || reason === 'assigned_tenant' || reason === 'shared_key',
  );
}

export function AccessGroupUsersPanel({
  users,
  loading,
  loadError,
  hasUnitLocks,
}: AccessGroupUsersPanelProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedUserId(null);
  }, [users]);

  if (loadError) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        {loadError}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-600">
        <UserCircleIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden />
        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">No users found</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {hasUnitLocks
            ? 'No tenants or shared-key holders match this group yet.'
            : 'Add unit locks to see tenants and shared-key holders for this group.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Tenants and shared-key holders with access to units in this group. Expand a row for links.
      </p>
      <div className={`${ACCESS_GROUP_LIST_SCROLL_CLASS} pr-0.5`}>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        {users.map((user, index) => {
          const isExpanded = expandedUserId === user.user_id;
          return (
            <div key={user.user_id}>
              <div
                className={`${index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''} ${
                  isExpanded ? 'bg-gray-50 dark:bg-gray-800/60' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedUserId(isExpanded ? null : user.user_id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-gray-900 dark:text-white">
                        {formatUserName(user)}
                      </span>
                      {shouldShowRoleBadge(user) && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getRoleBadgeColor(user.role)}`}>
                          {formatRoleName(user.role)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {user.access_reasons.map((reason) => (
                        <span
                          key={reason}
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${ACCESS_REASON_CLASSES[reason]}`}
                        >
                          {ACCESS_REASON_LABELS[reason]}
                        </span>
                      ))}
                    </div>
                    {user.unit_numbers.length > 0 && (
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        Units: {user.unit_numbers.map((unitNumber) => `Unit ${unitNumber}`).join(', ')}
                      </p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronDownIcon className="mt-1 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  ) : (
                    <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  )}
                </button>
              </div>
              {isExpanded && (
                <AccessGroupRowDetailLinks
                  links={[{ label: 'View user', to: `/users/${user.user_id}/details` }]}
                />
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
