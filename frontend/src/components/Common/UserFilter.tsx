import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { UserIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { FilterComboboxEmptyOption } from '@/components/Common/FilterComboboxEmptyOption';
import { filterComboboxDropdownClass } from '@/components/Common/list-filters.styles';
import { useFilterDropdownPortal } from '@/hooks/useFilterDropdownPortal';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  facilityIds?: string[];
  unitCount?: number;
}

export type UserFilterAllowedUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  name?: string;
  role?: string;
};

interface UserFilterProps {
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  className?: string;
  facilityId?: string;
  roleFilter?: string;
  excludeUserIds?: string[];
  /** When set (including []), only these users are listed — skip the facility-wide users API. */
  allowedUsers?: UserFilterAllowedUser[];
  onDisplayLabelChange?: (label: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

function formatUserLabel(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName || 'Unknown'} ${user.lastName || 'User'}`.trim();
}

function allowedUserToFilterUser(entry: UserFilterAllowedUser): User {
  if (entry.firstName || entry.lastName) {
    return {
      id: entry.id,
      firstName: entry.firstName || 'Unknown',
      lastName: entry.lastName || 'User',
      email: entry.email || '',
      role: entry.role || '',
    };
  }
  const parts = (entry.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    id: entry.id,
    firstName: parts[0] || 'Unknown',
    lastName: parts.slice(1).join(' ') || 'User',
    email: entry.email || '',
    role: entry.role || '',
  };
}

function userMatchesQuery(user: User, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [user.firstName, user.lastName, user.email, formatUserLabel(user)]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function resolveUserFromResponse(data: unknown): User | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { user?: User; id?: string; firstName?: string; lastName?: string };
  if (record.user && typeof record.user === 'object') return record.user;
  if (record.id) return record as User;
  return null;
}

export const UserFilter: React.FC<UserFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search users...',
  className = '',
  facilityId,
  roleFilter,
  excludeUserIds = [],
  allowedUsers,
  onDisplayLabelChange,
  allowEmpty = false,
  emptyLabel = 'All users',
  disabled = false,
  emptyMessage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvingValueRef = useRef<string | null>(null);
  const userIsSearchingRef = useRef(false);
  const { dropdownRef, dropdownStyle } = useFilterDropdownPortal(isOpen, containerRef, [searchTerm]);

  const applySelectedUser = useCallback(
    (user: User | null) => {
      setSelectedUser(user);
      if (user) {
        userIsSearchingRef.current = false;
        const label = formatUserLabel(user);
        setSearchTerm(label);
        onDisplayLabelChange?.(label);
      } else if (!userIsSearchingRef.current) {
        setSearchTerm('');
        onDisplayLabelChange?.('');
      }
    },
    [onDisplayLabelChange],
  );

  const loadUsers = async (search: string = '', page: number = 1, isInitialLoad: boolean = true) => {
    try {
      if (isInitialLoad) setLoading(true);
      else setLoadingMore(true);

      const limit = 20;
      const offset = (page - 1) * limit;
      const params: Record<string, unknown> = {
        search: search || undefined,
        sortBy: 'name',
        sortOrder: 'asc',
        limit,
        offset,
      };

      if (facilityId) {
        params.facility = facilityId;
      }

      if (roleFilter) {
        params.role = roleFilter;
      }

      const response = await apiService.getUsers(params);

      if (response.success) {
        let newUsers = response.users || [];
        if (excludeUserIds.length > 0) {
          const exclude = new Set(excludeUserIds);
          newUsers = newUsers.filter((u: User) => !exclude.has(u.id));
        }
        const total = response.total || newUsers.length;

        if (isInitialLoad) {
          setUsers(newUsers);
          setFilteredUsers(newUsers);
        } else {
          setUsers((prev) => [...prev, ...newUsers]);
          setFilteredUsers((prev) => [...prev, ...newUsers]);
        }
        setTotalUsers(total);
        setCurrentPage(page);
        setHasMore(offset + newUsers.length < total);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const restrictToAllowed = allowedUsers !== undefined;
  const allowedUsersKey = restrictToAllowed
    ? allowedUsers.map((user) => user.id).join(',')
    : '';

  useEffect(() => {
    if (restrictToAllowed) return;
    void loadUsers();
  }, [facilityId, roleFilter, restrictToAllowed]);

  useEffect(() => {
    if (!restrictToAllowed) return;
    const mapped = (allowedUsers || []).map(allowedUserToFilterUser);
    setUsers(mapped);
    setFilteredUsers(mapped);
    setTotalUsers(mapped.length);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
  }, [restrictToAllowed, allowedUsersKey]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!userIsSearchingRef.current) {
        return;
      }
      if (restrictToAllowed) {
        const mapped = (allowedUsers || []).map(allowedUserToFilterUser);
        setFilteredUsers(mapped.filter((user) => userMatchesQuery(user, searchTerm)));
        return;
      }
      loadUsers(searchTerm, 1, true);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, facilityId, roleFilter, excludeUserIds.join(','), restrictToAllowed, allowedUsersKey]);

  useEffect(() => {
    if (!value) {
      resolvingValueRef.current = null;
      // While the user is typing a search query, don't reset the input when results refresh.
      if (userIsSearchingRef.current) {
        return;
      }
      if (selectedUser) {
        applySelectedUser(null);
      }
      return;
    }

    const user = users.find((u) => u.id === value);
    if (user) {
      resolvingValueRef.current = null;
      applySelectedUser(user);
    }
  }, [value, users, applySelectedUser, selectedUser]);

  useEffect(() => {
    if (!value) return;
    if (users.some((user) => user.id === value)) return;
    if (restrictToAllowed) return;
    if (resolvingValueRef.current === value) return;

    resolvingValueRef.current = value;
    let cancelled = false;

    (async () => {
      try {
        const response = await apiService.getUser(value);
        const fetched = resolveUserFromResponse(response);
        if (cancelled || !fetched) return;
        applySelectedUser(fetched);
        setUsers((prev) => (prev.some((u) => u.id === fetched.id) ? prev : [fetched, ...prev]));
        setFilteredUsers((prev) => (prev.some((u) => u.id === fetched.id) ? prev : [fetched, ...prev]));
      } catch (error) {
        console.error('Error resolving user filter selection:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, applySelectedUser, restrictToAllowed]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userIsSearchingRef.current = true;
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleUserSelect = (user: User) => {
    applySelectedUser(user);
    onChange(user.id);
    setIsOpen(false);
  };

  const handleClear = () => {
    applySelectedUser(null);
    onChange('');
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    if (!disabled) setIsOpen(true);
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const dropdown = isOpen && !disabled && (
    <div
      ref={dropdownRef}
      className={filterComboboxDropdownClass}
      style={dropdownStyle}
      onMouseDown={(e) => e.preventDefault()}
      onScroll={(e) => {
        if (restrictToAllowed) return;
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore) {
          void loadUsers(searchTerm, currentPage + 1, false);
        }
      }}
    >
      {loading ? (
        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading users...</div>
      ) : (
        <>
          {allowEmpty && (
            <FilterComboboxEmptyOption label={emptyLabel} onSelect={handleClear} />
          )}
          {filteredUsers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm
                ? 'No users found'
                : emptyMessage || (restrictToAllowed ? 'No users with events for this unit' : 'No users available')}
            </div>
          ) : (
            <>
          {!searchTerm && (
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
              All Users ({totalUsers})
            </div>
          )}
          {searchTerm && (
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Search Results ({totalUsers})
            </div>
          )}
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleUserSelect(user)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                selectedUser?.id === user.id
                  ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/20">
                      <span className="text-xs font-medium text-primary-800 dark:text-primary-200">
                        {(user.firstName || 'U').charAt(0)}
                        {(user.lastName || 'U').charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {formatUserLabel(user)}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                    </div>
                  </div>
                </div>
                <div className="ml-2 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  <div className="text-right">
                    <div className="font-medium">{(user.role || '').replace('_', ' ')}</div>
                    {user.facilityIds && user.facilityIds.length > 0 && (
                      <div>
                        {user.facilityIds.length} facilit{user.facilityIds.length !== 1 ? 'ies' : 'y'}
                      </div>
                    )}
                    {user.unitCount !== undefined && (
                      <div>
                        {user.unitCount} unit{user.unitCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
              {hasMore && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {loadingMore ? (
                    <div className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                      Loading more users...
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void loadUsers(searchTerm, currentPage + 1, false)}
                      className="w-full px-3 py-2 text-left text-sm text-primary-600 transition-colors hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
                    >
                      Load more users ({Math.max(0, totalUsers - filteredUsers.length)} remaining)
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <UserIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`block w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        />
      </div>
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
};
