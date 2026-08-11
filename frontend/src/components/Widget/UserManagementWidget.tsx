import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { InviteActions } from '@/components/UserManagement/InviteActions';
import { WIDGET_LIST_SCROLL_CLASS } from '@/utils/widget-layout.utils';
import { PlaceholderUserBadge } from '@/components/UserManagement/PlaceholderUserBadge';

type InviteStatus = 'never_invited' | 'invite_pending' | 'active' | 'placeholder';

interface UserRow {
  id: string;
  email: string | null;
  phoneNumber?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isPlaceholder?: boolean;
  lastLogin?: string | null;
  inviteStatus?: InviteStatus;
  invitedAt?: string | null;
  facilityNames?: string[];
}

interface UserManagementWidgetProps {
  currentSize: WidgetSize;
  onSizeChange?: (size: WidgetSize) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  facilityFilter?: string;
}

const STATUS_BADGE: Record<InviteStatus, { label: string; className: string }> = {
  never_invited: {
    label: 'Never invited',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  invite_pending: {
    label: 'Invite pending',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  placeholder: {
    label: 'Placeholder',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
};

export const UserManagementWidget: React.FC<UserManagementWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
  readOnly = false,
  facilityFilter,
}) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['medium', 'large', 'medium-tall', 'large-wide'];

  const loadUsers = useCallback(
    async (options?: { background?: boolean }) => {
      try {
        if (!options?.background) {
          setLoading(true);
          setError(null);
        }
        const response = await apiService.getUsers({
          search: search.trim() || undefined,
          facility: facilityFilter || undefined,
          limit: 40,
          offset: 0,
          sortBy: 'name',
          sortOrder: 'asc',
        });
        if (response.success) {
          setUsers(response.users || []);
        } else {
          setError('Failed to load users');
        }
      } catch (e) {
        console.error(e);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    },
    [search, facilityFilter],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void loadUsers();
    }, 250);
    return () => clearTimeout(t);
  }, [loadUsers]);

  return (
    <Widget
      title="User Management"
      icon={<UserGroupIcon className="h-5 w-5" />}
      currentSize={currentSize}
      availableSizes={availableSizes}
      onSizeChange={onSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
    >
      <div className="flex flex-col h-full min-h-0 gap-3">
        <div className="relative shrink-0">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Loading users…
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-sm text-gray-500 dark:text-gray-400 gap-2">
            <UsersIcon className="h-8 w-8 opacity-40" />
            No users found
          </div>
        ) : (
          <ul className={`flex-1 min-h-0 space-y-2 ${WIDGET_LIST_SCROLL_CLASS}`}>
            {users.map((user) => {
              const status = (user.inviteStatus ||
                (user.isPlaceholder
                  ? 'placeholder'
                  : user.lastLogin
                    ? 'active'
                    : 'never_invited')) as InviteStatus;
              const badge = STATUS_BADGE[status];
              const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unnamed';

              return (
                <li
                  key={user.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2.5 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/users/${user.id}/details`)}
                      className="text-left min-w-0 flex-1 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                          {name}
                        </span>
                        {user.isPlaceholder && <PlaceholderUserBadge />}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {user.email || user.phoneNumber || 'No contact'}
                      </p>
                    </button>
                    <span
                      className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <InviteActions
                      size="compact"
                      user={{
                        id: user.id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        phoneNumber: user.phoneNumber,
                        lastLogin: user.lastLogin,
                        isPlaceholder: user.isPlaceholder,
                      }}
                      onComplete={() => void loadUsers({ background: true })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Widget>
  );
};
