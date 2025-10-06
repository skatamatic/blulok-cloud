import React, { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/Modal/Modal';
import { UserRole } from '@/types/auth.types';
import { Facility } from '@/types/facility.types';
import { apiService } from '@/services/api.service';

interface FacilityAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    facilityIds?: string[];
  } | null;
}


export const FacilityAssignmentModal: React.FC<FacilityAssignmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
}) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load real facilities from API
  useEffect(() => {
    if (isOpen) {
      loadFacilities();
      // Set current user's facilities
      setSelectedFacilityIds(user?.facilityIds || []);
    }
  }, [isOpen, user]);

  const loadFacilities = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getFacilities();
      setFacilities(response.facilities || []);
    } catch (err) {
      console.error('Failed to load facilities:', err);
      setError('Failed to load facilities. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiService.setUserFacilities(user.id, selectedFacilityIds);
      
      if (response.success) {
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to update facility assignments');
      }
    } catch (err) {
      setError('An error occurred while updating facility assignments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacilityToggle = (facilityId: string) => {
    setSelectedFacilityIds(prev => 
      prev.includes(facilityId)
        ? prev.filter(id => id !== facilityId)
        : [...prev, facilityId]
    );
  };

  const isGlobalRole = user?.role === UserRole.ADMIN || user?.role === UserRole.DEV_ADMIN;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Facility Assignments
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Manage facility access for {user?.firstName} {user?.lastName}
        </p>
      </ModalHeader>

      <ModalBody>
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-4">
            <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
          </div>
        )}

        {isGlobalRole ? (
          <div className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400 mb-2">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Global Access
            </h4>
            <p className="text-gray-600 dark:text-gray-400">
              This user has {user?.role === UserRole.DEV_ADMIN ? 'development admin' : 'global admin'} privileges and can access all facilities automatically.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Select Facilities
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose which facilities this user can access. Users without facility assignments will have no access.
              </p>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="mt-1 h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="flex-1 space-y-1">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : facilities.length > 0 ? (
                facilities.map((facility) => (
                <label
                  key={facility.id}
                  className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-200"
                >
                  <input
                    type="checkbox"
                    checked={selectedFacilityIds.includes(facility.id)}
                    onChange={() => handleFacilityToggle(facility.id)}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {facility.name}
                    </div>
                    {facility.description && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {facility.description}
                      </div>
                    )}
                  </div>
                </label>
              ))
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-2">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    No Facilities Available
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Create facilities first before assigning users to them.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Selected:</strong> {selectedFacilityIds.length} of {facilities.length} facilities
              </div>
            </div>
          </div>
        )}
      </ModalBody>

      {!isGlobalRole && (
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating...
              </>
            ) : (
              'Update Assignments'
            )}
          </button>
        </ModalFooter>
      )}
    </Modal>
  );
};
