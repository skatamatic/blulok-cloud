import React from 'react';
import { UserRole } from '@/types/auth.types';
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

interface UserFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  facilityFilter: string;
  onFacilityFilterChange: (facility: string) => void;
  facilities: Array<{ id: string; name: string }>;
  facilitiesLoading?: boolean;
}

export const UserFilters: React.FC<UserFiltersProps> = ({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  facilityFilter,
  onFacilityFilterChange,
  facilities,
  facilitiesLoading = false,
}) => {
  const roleOptions = [
    { value: '', label: 'All Roles' },
    { value: UserRole.TENANT, label: 'Tenant' },
    { value: UserRole.FACILITY_ADMIN, label: 'Facility Admin' },
    { value: UserRole.MAINTENANCE, label: 'Maintenance' },
    { value: UserRole.BLULOK_TECHNICIAN, label: 'BluLok Technician' },
    { value: UserRole.ADMIN, label: 'Admin' },
    { value: UserRole.DEV_ADMIN, label: 'Dev Admin' },
  ];


  return (
    <div className="card mb-6">
      <div className="p-6">
        <div className="flex items-center space-x-2 mb-4">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filters & Search</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Search */}
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent navigation when backspace is pressed
                  e.stopPropagation();
                }}
                className="input pl-10"
                placeholder="Search users, emails, or facilities..."
              />
            </div>
          </div>

          {/* Role Filter */}
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role
            </label>
            <select
              id="role"
              value={roleFilter}
              onChange={(e) => onRoleFilterChange(e.target.value)}
              className="input"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Facility Filter */}
          <div>
            <label htmlFor="facility" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Facility
            </label>
            <select
              id="facility"
              value={facilityFilter}
              onChange={(e) => onFacilityFilterChange(e.target.value)}
              className="input"
              disabled={facilitiesLoading}
            >
              <option value="">All Facilities</option>
              {facilitiesLoading ? (
                <option value="" disabled>Loading facilities...</option>
              ) : (
                facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))
              )}
            </select>
          </div>

        </div>
      </div>
    </div>
  );
};
