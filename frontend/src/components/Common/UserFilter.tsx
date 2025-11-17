import React, { useState, useEffect, useRef } from 'react';
import { UserIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  facilityIds?: string[];
  unitCount?: number;
}

interface UserFilterProps {
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  className?: string;
  facilityId?: string; // Optional facility filter for scoping
  roleFilter?: string; // Optional role filter (e.g., 'tenant')
  excludeUserIds?: string[]; // Optional list of user IDs to exclude (e.g., self)
}

export const UserFilter: React.FC<UserFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search users...',
  className = '',
  facilityId,
  roleFilter,
  excludeUserIds = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load users on component mount
  useEffect(() => {
    loadUsers(1, true);
  }, []);

  // Load users when search term changes (with debouncing)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadUsers(1, true, searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Find selected user when value changes
  useEffect(() => {
    if (value && users.length > 0) {
      const user = users.find(u => u.id === value);
      setSelectedUser(user || null);
      if (user) {
        setSearchTerm(`${user.firstName || 'Unknown'} ${user.lastName || 'User'}`);
      }
    } else if (value === '') {
      // Only clear when value is explicitly set to empty string
      setSelectedUser(null);
      setSearchTerm('');
    }
  }, [value]);

  const loadUsers = async (_page: number = 1, _isInitialLoad: boolean = false, search: string = '') => {
    try {
      setLoading(true);
      
      const params: any = {
        search: search || undefined,
        sortBy: 'firstName',
        sortOrder: 'asc'
      };

      // Add facility filter if provided
      if (facilityId) {
        params.facility = facilityId;
      }

      // Add role filter if provided
      if (roleFilter) {
        params.role = roleFilter;
      }
      
      const response = await apiService.getUsers(params);
      
      if (response.success) {
        let newUsers = response.users || [];
        // Exclude any users by ID (e.g., current self)
        if (excludeUserIds && excludeUserIds.length > 0) {
          const exclude = new Set(excludeUserIds);
          newUsers = newUsers.filter((u: User) => !exclude.has(u.id));
        }
        const total = response.total || 0;
        
        setUsers(newUsers);
        setFilteredUsers(newUsers);
        setTotalUsers(total - (excludeUserIds?.length || 0));
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsOpen(true);
    
    // Don't clear the selection when typing - only clear when explicitly clearing
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setSearchTerm(`${user.firstName || 'Unknown'} ${user.lastName || 'User'}`);
    onChange(user.id);
    setIsOpen(false);
  };


  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Don't close if clicking on dropdown
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    
    // Don't automatically clear the search term - let the user keep typing
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };


  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
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
          className="block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-[100] mt-1 w-full bg-white dark:bg-gray-800 shadow-xl max-h-60 rounded-lg py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none border border-gray-200 dark:border-gray-700"
          style={{ minWidth: '300px' }}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No users found' : 'No users available'}
            </div>
          ) : (
            <>
              {!searchTerm && (
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  All Users ({totalUsers})
                </div>
              )}
              {searchTerm && (
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Search Results ({totalUsers})
                </div>
              )}
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleUserSelect(user)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    selectedUser?.id === user.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <div className="flex-shrink-0 h-8 w-8 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-primary-800 dark:text-primary-200">
                            {(user.firstName || 'U').charAt(0)}{(user.lastName || 'U').charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {user.firstName || 'Unknown'} {user.lastName || 'User'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="text-right">
                        <div className="font-medium">{user.role.replace('_', ' ')}</div>
                        {user.facilityIds && user.facilityIds.length > 0 && (
                          <div>{user.facilityIds.length} facilit{user.facilityIds.length !== 1 ? 'ies' : 'y'}</div>
                        )}
                        {user.unitCount !== undefined && (
                          <div>{user.unitCount} unit{user.unitCount !== 1 ? 's' : ''}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
