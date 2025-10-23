import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlightWithPagination } from '@/hooks/useHighlightWithPagination';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { 
  HomeIcon,
  FunnelIcon,
  UserIcon,
  LockClosedIcon,
  LockOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
  PlusIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Unit, UnitFilters } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { AddUnitModal } from '@/components/Units/AddUnitModal';

const statusColors = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  occupied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  reserved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
};

const statusIcons = {
  available: CheckCircleIcon,
  occupied: UserIcon,
  maintenance: WrenchScrewdriverIcon,
  reserved: ClockIcon
};

export default function UnitsPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]); // Store full dataset for pagination calculations
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<UnitFilters>({
    search: '',
    status: '',
    unit_type: '',
    facility_id: '',
    tenant_id: '',
    sortBy: 'unit_number',
    sortOrder: 'asc',
    limit: 20
  });
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const isTenant = authState.user?.role === 'tenant';

  useEffect(() => {
    loadUnits();
  }, [filters, currentPage]);

  useEffect(() => {
    loadFacilities();
    loadUsers();
  }, []);

  const loadFacilities = async () => {
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

  const loadUsers = async () => {
    try {
      // setUsersLoading(true);
      const response = await apiService.getUsers();
      if (response.success) {
        // Filter out users with blank names and only include tenants
        const tenantUsers = (response.users || []).filter((user: any) => 
          user.firstName && user.lastName && user.role === 'tenant'
        );
        setUsers(tenantUsers);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      // setUsersLoading(false);
    }
  };

  const loadUnits = async () => {
    try {
      setLoading(true);
      const queryFilters = {
        ...filters,
        // Map user_id to tenant_id for backend compatibility
        tenant_id: filters.tenant_id,
        user_id: undefined, // Remove user_id as backend expects tenant_id
        offset: (currentPage - 1) * (filters.limit || 20)
      };
      
      // Debug logging
      console.log('Loading units with filters:', queryFilters);
      
      const response = isTenant ? await apiService.getMyUnits() : await apiService.getUnits(queryFilters);
      
      // Debug logging
      console.log('Units response:', response);
      
      setUnits(response.units || []);
      setTotal(response.total || response.units?.length || 0);
      setTotalPages(Math.ceil((response.total || 0) / (filters.limit || 20)));

      // Also load full dataset for pagination calculations (only if not tenant)
      if (!isTenant) {
        try {
          const fullDatasetFilters = {
            ...filters,
            tenant_id: filters.tenant_id,
            user_id: undefined,
            // Remove pagination parameters to get all data
            offset: undefined,
            limit: undefined
          };
          
          const fullResponse = await apiService.getUnits(fullDatasetFilters);
          setAllUnits(fullResponse.units || []);
        } catch (error) {
          console.warn('Failed to load full dataset for pagination:', error);
          // Fallback to current page data
          setAllUnits(response.units || []);
        }
      } else {
        // For tenants, use the current data as the full dataset
        setAllUnits(response.units || []);
      }
    } catch (error) {
      console.error('Failed to load units:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setFilters(prev => ({ ...prev, status: status === prev.status ? '' : status }));
    setCurrentPage(1);
  };

  const handleTypeFilter = (type: string) => {
    setFilters(prev => ({ ...prev, unit_type: type === prev.unit_type ? '' : type }));
    setCurrentPage(1);
  };

  const handleFacilityFilter = (facilityId: string) => {
    setFilters(prev => ({ ...prev, facility_id: facilityId === prev.facility_id ? '' : facilityId }));
    setCurrentPage(1);
  };

  const handleUserFilter = (userId: string) => {
    setFilters(prev => ({ ...prev, tenant_id: userId === prev.tenant_id ? '' : userId }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle highlighting when page loads - use allUnits for proper pagination calculation
  useHighlightWithPagination(
    allUnits, 
    (unit) => unit.id, 
    (id) => generateHighlightId('unit', id),
    currentPage,
    filters.limit || 20,
    handlePageChange
  );

  const handleLockToggle = async (unit: Unit) => {
    if (!unit.blulok_device || !canManage) return;
    
    try {
      const newStatus = unit.blulok_device.lock_status === 'locked' ? 'unlocked' : 'locked';
      await apiService.updateLockStatus(unit.blulok_device.id, newStatus);
      await loadUnits(); // Refresh data
    } catch (error) {
      console.error('Failed to toggle lock:', error);
    }
  };

  const UnitCard = ({ unit }: { unit: Unit }) => {
    const StatusIcon = statusIcons[unit.status];
    const batteryColor = unit.blulok_device?.battery_level && unit.blulok_device.battery_level < 20 ? 'text-red-500' : 
                        unit.blulok_device?.battery_level && unit.blulok_device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500';
    
    return (
      <div 
        id={generateHighlightId('unit', unit.id)}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-gray-50 dark:hover:bg-gray-700/30"
        onClick={() => navigate(`/units/${unit.id}`)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg mr-4">
              <HomeIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Unit {unit.unit_number}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{unit.unit_type}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {unit.status}
            </span>
          </div>
        </div>

        {unit.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{unit.description}</p>
        )}

        {/* Tenant Info */}
        {unit.primary_tenant && (
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            <UserIcon className="h-4 w-4 mr-2" />
            <span className="font-medium">
              {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
            </span>
            {unit.shared_tenants && unit.shared_tenants.length > 0 && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                +{unit.shared_tenants.length} shared
              </span>
            )}
          </div>
        )}

        {/* Unit Details */}
        <div className="space-y-3">
          {unit.blulok_device && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Lock Status</span>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[unit.blulok_device.lock_status as keyof typeof statusColors]}`}>
                  {unit.blulok_device.lock_status === 'locked' ? 
                    <LockClosedIcon className="h-3 w-3 mr-1" /> : 
                    <LockOpenIcon className="h-3 w-3 mr-1" />
                  }
                  {unit.blulok_device.lock_status}
                </span>
              </div>
              {unit.blulok_device.battery_level && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Battery</span>
                  <span className={`font-medium ${batteryColor}`}>
                    {unit.blulok_device.battery_level}%
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Features */}
        {unit.features && unit.features.length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-1">
              {unit.features.slice(0, 3).map((feature, index) => (
                <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  {feature}
                </span>
              ))}
              {unit.features.length > 3 && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  +{unit.features.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/facilities/${unit.facility_id}`, { state: { tab: 'units' } });
                }}
                className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <BuildingOfficeIcon className="h-4 w-4 mr-1" />
                View Facility
                <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
              </button>
            </div>
            {canManage && unit.blulok_device && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLockToggle(unit);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  unit.blulok_device.lock_status === 'locked'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                {unit.blulok_device.lock_status === 'locked' ? 'Unlock' : 'Lock'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const UnitTableRow = ({ unit }: { unit: Unit }) => {
    return (
      <tr 
        id={generateHighlightId('unit', unit.id)}
        className="transition-colors duration-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
        onClick={() => navigate(`/units/${unit.id}`)}
      >
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center">
            <div className="flex-shrink-0 h-8 w-8">
              <div className="h-8 w-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <HomeIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Unit {unit.unit_number}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{unit.unit_type}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
            {unit.status}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
          {unit.primary_tenant ? (
            <div>
              <div className="font-medium">{unit.primary_tenant.first_name} {unit.primary_tenant.last_name}</div>
              <div className="text-gray-500 dark:text-gray-400">{unit.primary_tenant.email}</div>
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">—</span>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          {unit.blulok_device ? (
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[unit.blulok_device.lock_status as keyof typeof statusColors]}`}>
                {unit.blulok_device.lock_status === 'locked' ? 
                  <LockClosedIcon className="h-3 w-3 mr-1" /> : 
                  <LockOpenIcon className="h-3 w-3 mr-1" />
                }
                {unit.blulok_device.lock_status}
              </span>
              {unit.blulok_device.battery_level && (
                <span className={`text-xs font-medium ${
                  unit.blulok_device.battery_level < 20 ? 'text-red-500' : 
                  unit.blulok_device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500'
                }`}>
                  {unit.blulok_device.battery_level}%
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">No device</span>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/units/${unit.id}`);
              }}
              className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </button>
            {canManage && unit.blulok_device && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLockToggle(unit);
                }}
                className={`p-1 rounded transition-colors ${
                  unit.blulok_device.lock_status === 'locked'
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-red-600 hover:text-red-700'
                }`}
              >
                {unit.blulok_device.lock_status === 'locked' ? 
                  <LockOpenIcon className="h-4 w-4" /> : 
                  <LockClosedIcon className="h-4 w-4" />
                }
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Define all possible unit types (not dynamic)
  const allUnitTypes = ['Small', 'Medium', 'Large', 'Extra Large', 'XL', 'XXL'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isTenant ? 'My Units' : 'Units'}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {isTenant ? 'View and manage your assigned units' : 'Manage storage units and tenant assignments'}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {!isTenant && (
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Table
              </button>
            </div>
          )}
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 transition-colors"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Unit
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <ExpandableFilters
        searchValue={filters.search || ''}
        onSearchChange={handleSearch}
        searchPlaceholder="Search units..."
        isExpanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        onClearFilters={() => {
          setFilters({
            search: '',
            status: '',
            unit_type: '',
            facility_id: '',
            tenant_id: '',
            sortBy: 'unit_number',
            sortOrder: 'asc',
            limit: 20,
            offset: 0
          });
        }}
        sections={[
          {
            title: 'Status',
            icon: <FunnelIcon className="h-5 w-5" />,
            options: [
              { key: '', label: 'All Status' },
              { key: 'available', label: 'Available', color: 'green' },
              { key: 'occupied', label: 'Occupied', color: 'blue' },
              { key: 'maintenance', label: 'Maintenance', color: 'yellow' },
              { key: 'reserved', label: 'Reserved', color: 'purple' }
            ],
            selected: filters.status || '',
            onSelect: handleStatusFilter
          },
          {
            title: 'Unit Type',
            icon: <HomeIcon className="h-5 w-5" />,
            options: [
              { key: '', label: 'All Types' },
              ...allUnitTypes.map(type => ({
                key: type,
                label: type,
                color: 'primary'
              }))
            ],
            selected: filters.unit_type || '',
            onSelect: handleTypeFilter
          },
          // Only show facility and user filters for non-tenants
          ...(!isTenant ? [
            {
              title: 'Facility',
              icon: <BuildingOfficeIcon className="h-5 w-5" />,
              type: 'select' as const,
              options: [
                { key: '', label: 'All Facilities' },
                ...facilities.map(facility => ({
                  key: facility.id,
                  label: facility.name
                }))
              ],
              selected: filters.facility_id || '',
              onSelect: handleFacilityFilter
            },
            {
              title: 'User',
              icon: <UserIcon className="h-5 w-5" />,
              type: 'select' as const,
              options: [
                { key: '', label: 'All Users' },
                ...users.map(user => ({
                  key: user.id,
                  label: `${user.firstName} ${user.lastName}`
                }))
              ],
              selected: filters.tenant_id || '',
              onSelect: handleUserFilter
            }
          ] : [])
        ]}
      />

      {/* Results summary */}
      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {units.length} out of {total} units
        </p>
      </div>

      {/* Units */}
      {loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
              <div className="flex items-center space-x-4 mb-4">
                <div className="h-12 w-12 bg-gray-300 dark:bg-gray-600 rounded-lg"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded"></div>
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : units.length === 0 ? (
        <div className="text-center py-12">
          <HomeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {isTenant ? 'No units assigned' : 'No units found'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isTenant 
              ? 'You don\'t have any units assigned to you yet.'
              : filters.search || filters.status || filters.unit_type 
                ? 'Try adjusting your filters.' 
                : 'Get started by adding a new unit.'
            }
          </p>
          {canManage && !filters.search && !filters.status && !filters.unit_type && (
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Unit
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((unit) => (
            <UnitCard key={unit.id} unit={unit} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Unit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Device
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {units.map((unit) => (
                <UnitTableRow key={unit.id} unit={unit} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isTenant && totalPages > 1 && (
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
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Showing{' '}
                <span className="font-medium">{(currentPage - 1) * (filters.limit || 20) + 1}</span>
                {' '}to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * (filters.limit || 20), total)}
                </span>
                {' '}of{' '}
                <span className="font-medium">{total}</span>
                {' '}results
              </p>
            </div>
            <div>
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
        </div>
      )}

      {/* Add Unit Modal */}
      <AddUnitModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          loadUnits();
          setShowAddModal(false);
        }}
      />
    </div>
  );
}
