import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlight } from '@/hooks/useHighlight';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { AddUserModal } from '@/components/UserManagement/AddUserModal';
import { FacilityAssignmentModal } from '@/components/UserManagement/FacilityAssignmentModal';
import { SortableHeader } from '@/components/UserManagement/SortableHeader';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { 
  PlusIcon, 
  PencilIcon, 
  CheckIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  FunnelIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  facilityNames?: string[];
  facilityIds?: string[];
}

export default function UserManagementPage() {
  const location = useLocation();
  const { authState } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(
    (location.state as any)?.openAddModal || false
  );
  const [facilityModal, setFacilityModal] = useState<{
    isOpen: boolean;
    user: User | null;
  }>({
    isOpen: false,
    user: null,
  });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Filter states
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Facilities state
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string }>>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchFacilities();
  }, []);

  const fetchFacilities = async () => {
    try {
      // setFacilitiesLoading(true);
      const response = await apiService.getFacilities();
      if (response.success) {
        setFacilities(response.facilities || []);
      } else {
        console.error('Failed to fetch facilities:', response.message);
      }
    } catch (error) {
      console.error('Error fetching facilities:', error);
    } finally {
      // setFacilitiesLoading(false);
    }
  };

  const fetchUsers = useCallback(async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setSearchLoading(true);
      }
      
      const limit = 20;
      // const offset = (currentPage - 1) * limit;
      
      const response = await apiService.getUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        facility: facilityFilter || undefined,
        sortBy,
        sortOrder,
      });
      if (response.success) {
        setUsers(response.users);
        setTotal(response.total || 0);
        setTotalPages(Math.ceil((response.total || 0) / limit));
        setError('');
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('Error fetching users');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setSearchLoading(false);
      }
    }
  }, [search, roleFilter, facilityFilter, sortBy, sortOrder, currentPage]);

  // Initial load
  useEffect(() => {
    fetchUsers(true);
  }, []);

  // Debounced fetch for search/filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1); // Reset to first page when filters change
      fetchUsers(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, roleFilter, facilityFilter, sortBy, sortOrder]);

  // Handle highlighting when page loads
  useHighlight(users, (user) => user.id, (id) => generateHighlightId('user', id));

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const formatRoleName = (role: UserRole): string => {
    switch (role) {
      case UserRole.DEV_ADMIN:
        return 'Dev Admin';
      case UserRole.ADMIN:
        return 'Admin';
      case UserRole.FACILITY_ADMIN:
        return 'Facility Admin';
      case UserRole.BLULOK_TECHNICIAN:
        return 'BluLok Technician';
      case UserRole.MAINTENANCE:
        return 'Maintenance';
      case UserRole.TENANT:
        return 'Tenant';
      default:
        return role;
    }
  };

  const getRoleBadgeColor = (role: UserRole): string => {
    switch (role) {
      case UserRole.DEV_ADMIN:
        return 'bg-purple-100 text-purple-800';
      case UserRole.ADMIN:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case UserRole.FACILITY_ADMIN:
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      case UserRole.BLULOK_TECHNICIAN:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case UserRole.MAINTENANCE:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case UserRole.TENANT:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const handleDeactivateUser = (userId: string, userName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Deactivate User',
      message: `Are you sure you want to deactivate ${userName}? They will no longer be able to access the system.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const response = await apiService.deactivateUser(userId);
          if (response.success) {
            fetchUsers(); // Refresh the list
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
          } else {
            setError(response.message || 'Failed to deactivate user');
          }
        } catch (err) {
          setError('Error deactivating user');
        }
      },
    });
  };

  const handleActivateUser = async (userId: string) => {
    try {
      const response = await apiService.activateUser(userId);
      if (response.success) {
        fetchUsers(); // Refresh the list
      } else {
        setError(response.message || 'Failed to activate user');
      }
    } catch (err) {
      setError('Error activating user');
    }
  };

  const handleSort = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">User Management</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage user accounts, roles, and permissions for your BluLok system.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {searchLoading && (
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
              <span>Updating...</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 transition-colors"
            disabled={loading}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-6">
          <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
        </div>
      )}

      {/* Filters */}
      <ExpandableFilters
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search users, emails, or facilities..."
        isExpanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        onClearFilters={() => {
          setSearch('');
          setRoleFilter('');
          setFacilityFilter('');
        }}
        sections={[
          {
            title: 'Role',
            icon: <FunnelIcon className="h-5 w-5" />,
            type: 'select',
            options: [
              { key: '', label: 'All Roles' },
              { key: UserRole.TENANT, label: 'Tenant' },
              { key: UserRole.FACILITY_ADMIN, label: 'Facility Admin' },
              { key: UserRole.MAINTENANCE, label: 'Maintenance' },
              { key: UserRole.BLULOK_TECHNICIAN, label: 'BluLok Technician' },
              { key: UserRole.ADMIN, label: 'Admin' },
              { key: UserRole.DEV_ADMIN, label: 'Dev Admin' }
            ],
            selected: roleFilter,
            onSelect: setRoleFilter
          },
          {
            title: 'Facility',
            icon: <BuildingOfficeIcon className="h-5 w-5" />,
            type: 'select',
            options: [
              { key: '', label: 'All Facilities' },
              ...facilities.map(facility => ({
                key: facility.id,
                label: facility.name
              }))
            ],
            selected: facilityFilter,
            onSelect: setFacilityFilter
          }
        ]}
      />

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {users.length} out of {total} users
        </p>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <SortableHeader
                  label="User"
                  sortKey="name"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Role"
                  sortKey="role"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Facilities
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {loading ? (
                // Skeleton loading rows for initial load
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                        </div>
                        <div className="ml-4">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-12"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {users.map((user) => (
                  <tr 
                    key={user.id} 
                    id={generateHighlightId('user', user.id)}
                    className="group transition-all duration-200 cursor-pointer hover:shadow-sm border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                  >
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-600 dark:text-primary-300">
                              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {formatRoleName(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        user.isActive 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      {user.lastLogin 
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : 'Never'
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      {user.role === UserRole.ADMIN || user.role === UserRole.DEV_ADMIN ? (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">All Facilities</span>
                      ) : user.facilityNames && user.facilityNames.length > 0 ? (
                        <div className="space-y-1">
                          {user.facilityNames.slice(0, 2).map((name, index) => (
                            <div key={index} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                              {name}
                            </div>
                          ))}
                          {user.facilityNames.length > 2 && (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              +{user.facilityNames.length - 2} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-red-500 dark:text-red-400">No access</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => setFacilityModal({ isOpen: true, user })}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200"
                          title="Manage facility access"
                        >
                          <BuildingStorefrontIcon className="h-4 w-4" />
                        </button>
                        <button className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 transition-colors duration-200">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {user.isActive ? (
                          <button 
                            onClick={() => handleDeactivateUser(user.id, `${user.firstName} ${user.lastName}`)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200"
                            disabled={user.id === authState.user?.id}
                            title="Deactivate user"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleActivateUser(user.id)}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 transition-colors duration-200"
                            title="Activate user"
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {users.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-gray-500 dark:text-gray-400">No users found.</div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:items-center sm:justify-center">
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === pageNum
                          ? 'z-10 bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <AddUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchUsers}
      />

      {/* Facility Assignment Modal */}
      <FacilityAssignmentModal
        isOpen={facilityModal.isOpen}
        onClose={() => setFacilityModal({ isOpen: false, user: null })}
        onSuccess={fetchUsers}
        user={facilityModal.user}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText="Confirm"
        cancelText="Cancel"
      />
    </div>
  );
}
