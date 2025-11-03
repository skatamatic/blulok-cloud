import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlight } from '@/hooks/useHighlight';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import {
  BuildingOfficeIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  PlusIcon,
  FunnelIcon,
  CheckCircleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  Squares2X2Icon,
  ListBulletIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Facility, FacilityFilters } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { AddFacilityModal } from '@/components/Facilities/AddFacilityModal';

const statusColors = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
};

const statusIcons = {
  active: CheckCircleIcon,
  inactive: ClockIcon,
  maintenance: WrenchScrewdriverIcon
};

export default function FacilitiesPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<FacilityFilters>({
    search: '',
    status: '',
    sortBy: 'name',
    sortOrder: 'asc',
    limit: 12,
    offset: 0,
    user_id: ''
  });
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const canManageFacilities = ['admin', 'dev_admin'].includes(authState.user?.role || '');

  useEffect(() => {
    loadFacilities();
  }, [filters, currentPage]);


  // Handle highlighting when page loads - only when facilities are loaded
  useHighlight(facilities, (facility) => facility.id, (id) => generateHighlightId('facility', id));

  const loadFacilities = async () => {
    try {
      setLoading(true);
      const queryFilters = {
        ...filters,
        offset: (currentPage - 1) * (filters.limit || 20)
      };
      const response = await apiService.getFacilities(queryFilters);
      setFacilities(response.facilities || []);
      setTotal(response.total || 0);
      setTotalPages(Math.ceil((response.total || 0) / (filters.limit || 20)));
    } catch (error) {
      console.error('Failed to load facilities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value, offset: 0 }));
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setFilters(prev => ({ ...prev, status: status === prev.status ? '' : status, offset: 0 }));
    setCurrentPage(1);
  };

  const handleSort = (sortBy: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: sortBy as any,
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      offset: 0
    }));
    setCurrentPage(1);
  };

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value || '', offset: 0 }));
    setCurrentPage(1);
  };

  const hasActiveFilters = () => {
    return Boolean(
      (filters.search && filters.search.trim() !== '') || 
      (filters.status && filters.status !== '') ||
      (filters.user_id && filters.user_id !== '')
    );
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };


  const FacilityTableRow = ({ facility }: { facility: Facility }) => {
    const StatusIcon = statusIcons[facility.status];
    
    return (
      <tr 
        id={generateHighlightId('facility', facility.id)}
        className="group transition-all duration-200 cursor-pointer hover:shadow-sm border-b border-gray-200 dark:border-gray-700 last:border-b-0"
        onClick={() => navigate(`/facilities/${facility.id}`)}
      >
        <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
          <div className="flex items-center">
            <div className="flex-shrink-0 h-10 w-10">
              {facility.branding_image && facility.image_mime_type ? (
                <img 
                  src={`data:${facility.image_mime_type};base64,${facility.branding_image}`} 
                  alt={facility.name}
                  className="h-10 w-10 rounded-lg object-contain bg-white dark:bg-gray-100 p-1"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                  <BuildingOfficeIcon className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                </div>
              )}
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {facility.name}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {facility.address}
              </div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[facility.status]}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {facility.status.charAt(0).toUpperCase() + facility.status.slice(1)}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
          {facility.stats?.totalUnits || 0}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
          {facility.stats?.occupiedUnits || 0}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
          {facility.stats ? `${facility.stats.devicesOnline}/${facility.stats.devicesTotal}` : '0/0'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
          <span className="text-gray-400 dark:text-gray-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            ›
          </span>
        </td>
      </tr>
    );
  };

  const FacilityGridCard = ({ facility }: { facility: Facility }) => {
    const StatusIcon = statusIcons[facility.status];

    return (
      <div
        id={generateHighlightId('facility', facility.id)}
        onClick={() => navigate(`/facilities/${facility.id}`)}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-md hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer"
      >
        {/* All content - always visible */}
        <div className="p-6 space-y-4">
          {/* Header with image and basic info */}
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              {facility.branding_image && facility.image_mime_type ? (
                <img
                  src={`data:${facility.image_mime_type};base64,${facility.branding_image}`}
                  alt={facility.name}
                  className="h-16 w-16 rounded-lg object-contain bg-white dark:bg-gray-100 p-1"
                />
              ) : (
                <div className="h-16 w-16 bg-primary-100 dark:bg-primary-900/20 rounded-lg flex items-center justify-center">
                  <BuildingOfficeIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {facility.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {facility.address}
              </p>
              <div className="mt-3 flex items-center space-x-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[facility.status]}`}>
                  <StatusIcon className="h-4 w-4 mr-2" />
                  {facility.status.charAt(0).toUpperCase() + facility.status.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {facility.stats?.totalUnits || 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Units</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {facility.stats?.occupiedUnits || 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Occupied</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {facility.stats ? `${facility.stats.devicesOnline}/${facility.stats.devicesTotal}` : '0/0'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Devices</div>
            </div>
          </div>

          {/* Detailed information - always visible */}
          <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Contact Information</h4>
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <EnvelopeIcon className="h-4 w-4 mr-2" />
                    {facility.contact_email || 'N/A'}
                  </div>
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <PhoneIcon className="h-4 w-4 mr-2" />
                    {facility.contact_phone || 'N/A'}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Statistics</h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Total Units:</span>
                    <span className="text-gray-900 dark:text-white">{facility.stats?.totalUnits || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Occupied:</span>
                    <span className="text-gray-900 dark:text-white">{facility.stats?.occupiedUnits || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Devices:</span>
                    <span className="text-gray-900 dark:text-white">
                      {facility.stats ? `${facility.stats.devicesOnline}/${facility.stats.devicesTotal}` : '0/0'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <MapPinIcon className="h-4 w-4 mr-1" />
                {facility.address}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Alias for backward compatibility
  const FacilityCard = FacilityGridCard;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Facilities</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage and monitor your storage facilities
          </p>
        </div>
        <div className="flex items-center space-x-3">
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
          </div>
          {canManageFacilities && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 transition-colors"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Facility
            </button>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <ExpandableFilters
        searchValue={filters.search || ''}
        onSearchChange={handleSearch}
        searchPlaceholder="Search facilities..."
        isExpanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        hasActiveFilters={hasActiveFilters()}
        onClearFilters={() => {
          setFilters({
            search: '',
            status: '',
            sortBy: 'name',
            sortOrder: 'asc',
            limit: 12,
            offset: 0,
            user_id: ''
          });
        }}
        sections={[
          // All filters in expanded view for better spacing
          ...(filtersExpanded ? [
            {
              title: 'Status',
              icon: <FunnelIcon className="h-5 w-5" />,
              options: [
                { key: '', label: 'All Status', color: 'primary' },
                { key: 'active', label: 'Active', color: 'green' },
                { key: 'inactive', label: 'Inactive', color: 'red' },
                { key: 'maintenance', label: 'Maintenance', color: 'yellow' }
              ],
              selected: filters.status || '',
              onSelect: handleStatusFilter
            },
            {
              title: 'Sort By',
              icon: <BuildingOfficeIcon className="h-5 w-5" />,
              type: 'select' as const,
              options: [
                { key: 'name', label: 'Sort by Name' },
                { key: 'status', label: 'Sort by Status' },
                { key: 'created_at', label: 'Sort by Created' }
              ],
              selected: filters.sortBy || 'name',
              onSelect: handleSort
            },
            {
              title: 'User',
              icon: <UserIcon className="h-5 w-5" />,
              type: 'user' as const,
              options: [],
              selected: filters.user_id || '',
              onSelect: (value: string) => handleFilterChange('user_id', value || undefined),
              placeholder: 'Search users...'
            }
          ] : [])
        ]}
      />

      {/* Results summary */}
      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {facilities.length} out of {total} facilities
        </p>
      </div>

      {/* Facilities */}
      {loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'space-y-4'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`${viewMode === 'grid' ? 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden' : 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'} animate-pulse`}>
              {viewMode === 'grid' ? (
                <>
                  <div className="h-32 bg-gray-300 dark:bg-gray-600"></div>
                  <div className="p-6 space-y-4">
                    <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full"></div>
                    <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-lg"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
                      <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                    </div>
                    <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded-full w-16"></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : facilities.length === 0 ? (
        <div className="text-center py-12">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No facilities found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {filters.search || filters.status ? 'Try adjusting your filters.' : 'Get started by adding a new facility.'}
          </p>
          {canManageFacilities && !filters.search && !filters.status && (
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Facility
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {facilities.map((facility) => (
            <FacilityCard key={facility.id} facility={facility} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Facility
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total Units
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Occupied
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Devices
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {facilities.map((facility) => (
                <FacilityTableRow key={facility.id} facility={facility} />
              ))}
            </tbody>
          </table>
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

      {/* Add Facility Modal */}
      <AddFacilityModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          loadFacilities();
          setShowAddModal(false);
        }}
      />
    </div>
  );
}
