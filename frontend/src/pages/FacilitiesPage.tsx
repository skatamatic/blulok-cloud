import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';

export default function FacilitiesPage() {
  const navigate = useNavigate();
  const { selectedFacilityId, isAllFacilitiesSelected, isLoading } = useGlobalFacility();

  useEffect(() => {
    // If loading, wait
    if (isLoading) return;

    // If "All Facilities" is selected, stay on this page (show message)
    if (isAllFacilitiesSelected) {
      return;
    }

    // If a specific facility is selected, redirect to its details page
    if (selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID) {
      navigate(`/facilities/${selectedFacilityId}`, { replace: true });
    }
  }, [selectedFacilityId, isAllFacilitiesSelected, isLoading, navigate]);

  // Show message when "All Facilities" is selected
  if (isAllFacilitiesSelected) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <BuildingOfficeIcon className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            All Facilities View
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Facility details are not available when viewing all facilities. Please select a specific facility from the dropdown above to view its details.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading facilities...</p>
        </div>
      </div>
    );
  }

  // Default: redirecting (shouldn't be visible)
  return null;
}
