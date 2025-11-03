import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlightWithPagination } from '@/hooks/useHighlightWithPagination';
import { 
  HomeIcon,
  MapIcon,
  FunnelIcon,
  UserIcon,
  LockClosedIcon,
  LockOpenIcon,
  PlusIcon,
  ArrowTopRightOnSquareIcon,
  Squares2X2Icon,
  ListBulletIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Unit, UnitFilters } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { AddUnitModal } from '@/components/Units/AddUnitModal';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { UserFilter } from '@/components/Common/UserFilter';
import { FacilityDropdown } from '@/components/Common/FacilityDropdown';

const statusColors = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  occupied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  reserved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
};

export default function UnitsManagementPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]); // Store full dataset for pagination calculations
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<UnitFilters>({
    search: '',
    status: '',
    unit_type: '',
    facility_id: '',
    lock_status: 'all',
    sortBy: 'unit_number',
    sortOrder: 'asc',
    limit: 20,
    offset: 0,
    tenant_id: '' // Changed from user_id to tenant_id
  });

  // Check if any filters are active
  const hasActiveFilters = () => {
    return !!(
      filters.search?.trim() ||
      filters.status ||
      filters.unit_type ||
      filters.facility_id ||
      filters.tenant_id ||
      (filters.lock_status && filters.lock_status !== 'all')
    );
  };
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'sitemap'>('grid');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const isTenant = authState.user?.role === 'tenant';

  useEffect(() => {
    loadUnits();
  }, [filters, currentPage]);

  useEffect(() => {
    loadFacilities();
  }, []);

  // Load and persist facility selection
  useEffect(() => {
    // Load from localStorage on mount
    const savedFacilityId = localStorage.getItem('selectedFacilityId');
    if (savedFacilityId && !filters.facility_id) {
      setFilters(prev => ({ ...prev, facility_id: savedFacilityId }));
    }
  }, []);

  // Auto-select facility if none selected and facilities are available
  useEffect(() => {
    if (facilities.length > 0 && !filters.facility_id) {
      // Try to use saved facility if it exists in the list
      const savedFacilityId = localStorage.getItem('selectedFacilityId');
      const facilityToSelect = savedFacilityId && facilities.find(f => f.id === savedFacilityId)
        ? savedFacilityId
        : facilities[0].id;
      
      setFilters(prev => ({ ...prev, facility_id: facilityToSelect }));
      localStorage.setItem('selectedFacilityId', facilityToSelect);
    }
  }, [facilities]);

  // Persist facility selection to localStorage when it changes
  useEffect(() => {
    if (filters.facility_id) {
      localStorage.setItem('selectedFacilityId', filters.facility_id);
    }
  }, [filters.facility_id]);

  const loadFacilities = async () => {
    try {
      // Fetch all facilities without pagination for dropdown
      const response = await apiService.getFacilities({ limit: 1000 });
      // Handle both response formats (with or without success property)
      const facilitiesData = response.success ? response.facilities : (response.facilities || []);
      setFacilities(facilitiesData);
    } catch (error) {
      console.error('Failed to load facilities:', error);
    }
  };

  const loadUnits = async () => {
    // For non-tenants, require facility selection
    if (!isTenant && !filters.facility_id) {
      setLoading(false);
      setUnits([]);
      setAllUnits([]);
      setTotal(0);
      return;
    }

    try {
      setLoading(true);
      const queryFilters: any = {
        ...filters,
        offset: (currentPage - 1) * (filters.limit || 20)
      };
      
      // Only include search if it has a value (remove empty strings)
      if (!queryFilters.search || !queryFilters.search.trim()) {
        delete queryFilters.search;
      }
      
      const response = isTenant ? await apiService.getMyUnits() : await apiService.getUnits(queryFilters);
      setUnits(response.units || []);
      setTotal(response.total || response.units?.length || 0);
      setTotalPages(Math.ceil((response.total || 0) / (filters.limit || 20)));

      // Also load full dataset for pagination calculations (only if not tenant)
      if (!isTenant) {
        try {
          const fullDatasetFilters: any = {
            ...filters,
            // Remove pagination parameters to get all data
            offset: undefined,
            limit: undefined
          };
          
          // Only include search if it has a value
          if (!fullDatasetFilters.search || !fullDatasetFilters.search.trim()) {
            delete fullDatasetFilters.search;
          }
          
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

  const handleLockStatusFilter = (lockStatus: string) => {
    setFilters(prev => ({ ...prev, lock_status: lockStatus as 'locked' | 'unlocked' | 'all' | 'unknown' }));
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

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value || '' }));
    setCurrentPage(1);
  };


  const handleFacilityFilter = (facilityId: string) => {
    setFilters(prev => ({ ...prev, facility_id: facilityId }));
    setCurrentPage(1);
  };

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

  const handleTenantManagement = (unit: Unit) => {
    navigate(`/units/${unit.id}?tab=tenant`);
  };

  const UnitCard = ({ unit }: { unit: Unit }) => {
    const batteryColor = unit.blulok_device?.battery_level && unit.blulok_device.battery_level < 20 ? 'text-red-500' : 
                        unit.blulok_device?.battery_level && unit.blulok_device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500';
    
    return (
      <div 
        id={generateHighlightId('unit', unit.id)}
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-md hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
        onClick={() => navigate(`/units/${unit.id}`)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl mr-4">
              <HomeIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                Unit {unit.unit_number}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{unit.unit_type}</p>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
            {unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
          </span>
        </div>

        {/* Tenant Info */}
        {unit.primary_tenant ? (
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            <UserIcon className="h-4 w-4 mr-2" />
            <span className="font-medium">
              {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
            </span>
            {unit.shared_tenants && unit.shared_tenants.length > 0 && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-full">
                +{unit.shared_tenants.length} shared
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center text-sm text-gray-400 dark:text-gray-500 mb-4">
            <UserIcon className="h-4 w-4 mr-2" />
            <span>No tenant assigned</span>
          </div>
        )}


        {/* Lock Status */}
        {unit.blulok_device && (
          <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center space-x-2">
              {unit.blulok_device.lock_status === 'locked' ? 
                <LockClosedIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : 
                <LockOpenIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              }
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {unit.blulok_device.lock_status === 'locked' ? 'Secured' : 'Unlocked'}
              </span>
            </div>
            {unit.blulok_device.battery_level && (
              <span className={`text-sm font-bold ${batteryColor}`}>
                {unit.blulok_device.battery_level}%
              </span>
            )}
          </div>
        )}

        {/* Features */}
        {unit.features && unit.features.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1">
              {unit.features.slice(0, 3).map((feature, index) => (
                <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400">
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
        <div className="flex space-x-2">
          {canManage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTenantManagement(unit);
              }}
              className="flex-1 flex items-center justify-center space-x-1 py-2 px-3 text-sm font-medium text-primary-700 bg-primary-100 hover:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-400 rounded-lg transition-colors"
            >
              <UserIcon className="h-4 w-4" />
              <span>Manage</span>
            </button>
          )}
          
          {canManage && unit.blulok_device && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLockToggle(unit);
              }}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
                unit.blulok_device.lock_status === 'locked'
                  ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400'
              }`}
            >
              {unit.blulok_device.lock_status === 'locked' ? 
                <LockOpenIcon className="h-4 w-4" /> : 
                <LockClosedIcon className="h-4 w-4" />
              }
              <span>{unit.blulok_device.lock_status === 'locked' ? 'Unlock' : 'Lock'}</span>
            </button>
          )}
        </div>

        {/* Quick links */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/facilities/${unit.facility_id}`, { state: { tab: 'units' } });
            }}
            className="flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            <BuildingOfficeIcon className="h-4 w-4 mr-1" />
            View Facility
            <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
          </button>
        </div>
      </div>
    );
  };

  // Get unique unit types for filtering
  const uniqueTypes = Array.from(new Set(units.map(unit => unit.unit_type).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Storage Units
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage storage units, tenants, and facility operations
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* View Mode Selector */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('sitemap')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'sitemap'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <MapIcon className="h-4 w-4" />
            </button>
          </div>

          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Unit
            </button>
          )}
        </div>
      </div>

      {/* Facility Selection - Prominent */}
      {!isTenant && viewMode !== 'sitemap' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Facility
          </label>
          <FacilityDropdown
            facilities={facilities}
            selectedFacilityId={filters.facility_id || ''}
            onSelect={(facilityId) => {
              setFilters(prev => ({ ...prev, facility_id: facilityId }));
              setCurrentPage(1);
            }}
            placeholder="Select a facility"
            required={true}
          />
        </div>
      )}

      {/* Filters */}
      {!isTenant && viewMode !== 'sitemap' && (
        <ExpandableFilters
          searchValue={filters.search || ''}
          onSearchChange={handleSearch}
          searchPlaceholder="Search units..."
          isExpanded={filtersExpanded}
          onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
          hasActiveFilters={hasActiveFilters()}
          onClearFilters={() => {
            const firstFacilityId = facilities.length > 0 ? facilities[0].id : '';
            setFilters({
              search: '',
              status: '',
              unit_type: '',
              facility_id: firstFacilityId,
              lock_status: 'all',
              sortBy: 'unit_number',
              sortOrder: 'asc',
              limit: 20,
              offset: 0,
              tenant_id: ''
            });
            if (firstFacilityId) {
              localStorage.setItem('selectedFacilityId', firstFacilityId);
            }
            setCurrentPage(1);
          }}
          sections={[
            // All filters in expanded view for better layout
            ...(filtersExpanded ? [
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
                title: 'Lock Status',
                icon: <LockClosedIcon className="h-5 w-5" />,
                options: [
                  { key: 'all', label: 'All Lock States' },
                  { key: 'locked', label: 'Locked', color: 'blue' },
                  { key: 'unlocked', label: 'Unlocked', color: 'green' },
                  { key: 'unknown', label: 'Unknown', color: 'gray' }
                ],
                selected: filters.lock_status || 'all',
                onSelect: handleLockStatusFilter
              },
              {
                title: 'Unit Type',
                icon: <HomeIcon className="h-5 w-5" />,
                options: [
                  { key: '', label: 'All Types' },
                  ...uniqueTypes.slice(0, 4).map(type => ({
                    key: type || '',
                    label: type || 'Unknown',
                    color: 'primary'
                  }))
                ],
                selected: filters.unit_type || '',
                onSelect: handleTypeFilter
              },
              {
                title: 'Tenant',
                icon: <UserIcon className="h-5 w-5" />,
                type: 'custom' as const,
                options: [],
                selected: filters.tenant_id || '',
                onSelect: () => {},
                customContent: (
                  <UserFilter
                    value={filters.tenant_id || ''}
                    onChange={(userId) => handleFilterChange('tenant_id', userId || undefined)}
                    placeholder="Search tenants..."
                    className="w-full"
                  />
                )
              }
            ] : [])
          ]}
        />
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {units.length} out of {total} units
        </p>
        
        {viewMode === 'sitemap' && (
          <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <MapIcon className="h-4 w-4" />
            <span>Interactive facility layout</span>
          </div>
        )}
      </div>

      {/* Content based on view mode */}
      {viewMode === 'sitemap' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 min-h-[600px]">
          <div className="text-center py-12">
            <MapIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Interactive Site Map</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Visual layout of your facility with real-time unit status
            </p>
            <button
              onClick={() => navigate('/facility-sitemap')}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              <MapIcon className="h-5 w-5 mr-2" />
              Open Site Map Editor
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
              <div className="flex items-center space-x-4 mb-4">
                <div className="h-12 w-12 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
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
                : 'Get started by adding a new storage unit.'
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {units.map((unit, index) => (
            <UnitCard key={`unit-grid-${unit.id}-${index}`} unit={unit} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-lg">
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
                  Lock Status
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {units.map((unit, index) => (
                <tr 
                  id={generateHighlightId('unit', unit.id)}
                  key={`unit-table-${unit.id}-${index}`}
                  className="group transition-all duration-200 cursor-pointer hover:shadow-sm border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                  onClick={() => navigate(`/units/${unit.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          <HomeIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          Unit {unit.unit_number}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {unit.unit_type}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
                      {unit.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                    {unit.primary_tenant ? (
                      <div>
                        <div className="font-medium">{unit.primary_tenant.first_name} {unit.primary_tenant.last_name}</div>
                        <div className="text-gray-500 dark:text-gray-400">{unit.primary_tenant.email}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
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
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                    <div className="flex items-center justify-end space-x-2">
                      {canManage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTenantManagement(unit);
                          }}
                          className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300"
                        >
                          <UserIcon className="h-4 w-4" />
                        </button>
                      )}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isTenant && viewMode !== 'sitemap' && totalPages > 1 && (
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
                Showing <span className="font-medium">{((currentPage - 1) * (filters.limit || 20)) + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * (filters.limit || 20), total)}</span> of{' '}
                <span className="font-medium">{total}</span> results
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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
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
                  } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                    return <span key={pageNum} className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">...</span>;
                  }
                  return null;
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

