import { useState, useEffect } from 'react';
import { 
  UserIcon,
  HomeIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  StarIcon
} from '@heroicons/react/24/outline';
import { Modal } from '@/components/Modal/Modal';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { apiService } from '@/services/api.service';
import { User } from '@/types/auth.types';
import { Unit } from '@/types/facility.types';

interface TenantAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  unit: Unit | null;
}

export function TenantAssignmentModal({ isOpen, onClose, onSuccess, unit }: TenantAssignmentModalProps) {
  const [tenants, setTenants] = useState<User[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [assignmentType, setAssignmentType] = useState<'primary' | 'shared'>('primary');
  const [loading, setLoading] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTenants();
    }
  }, [isOpen]);

  const loadTenants = async () => {
    try {
      const response = await apiService.getUsers({ 
        role: 'tenant'
      });
      setTenants(response.users || []);
    } catch (error) {
      console.error('Failed to load tenants:', error);
    }
  };

  const handleAssignTenant = async () => {
    if (!selectedTenant || !unit) return;

    try {
      setLoading(true);
      await apiService.assignTenantToUnit(unit.id, selectedTenant, assignmentType === 'primary');
      onSuccess();
      setSelectedTenant('');
    } catch (error) {
      console.error('Failed to assign tenant:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTenant = async (tenantId: string) => {
    if (!unit) return;

    try {
      setLoading(true);
      await apiService.removeTenantFromUnit(unit.id, tenantId);
      onSuccess();
      setShowRemoveConfirm(null);
    } catch (error) {
      console.error('Failed to remove tenant:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedTenant('');
    setAssignmentType('primary');
    setShowRemoveConfirm(null);
    onClose();
  };

  const availableTenants = tenants.filter(tenant => {
    const currentTenantIds = [
      unit?.primary_tenant?.id,
      ...(unit?.shared_tenants?.map(st => st.id) || [])
    ].filter(Boolean);
    return !currentTenantIds.includes(tenant.id);
  });

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} size="lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <HomeIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Manage Unit Access
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Unit {unit?.unit_number} - {unit?.unit_type}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="space-y-6">
            {/* Current Assignments */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Current Assignments</h4>
              
              {/* Primary Tenant */}
              {unit?.primary_tenant ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
                          <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
                          </p>
                          <StarIcon className="h-4 w-4 text-yellow-500" />
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Primary</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {unit.primary_tenant.email}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowRemoveConfirm(unit.primary_tenant!.id)}
                      className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
                  <UserIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No primary tenant assigned</p>
                </div>
              )}

              {/* Shared Tenants */}
              {unit?.shared_tenants && unit.shared_tenants.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Shared Access ({unit.shared_tenants.length})
                  </h5>
                  {unit.shared_tenants.map((tenant) => (
                    <div key={tenant.id} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                              <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {tenant.first_name} {tenant.last_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {tenant.email} • {tenant.access_type} access
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowRemoveConfirm(tenant.id)}
                          className="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Assignment */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Add New Assignment</h4>
              
              {/* Assignment Type */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Assignment Type
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="primary"
                      checked={assignmentType === 'primary'}
                      onChange={(e) => setAssignmentType(e.target.value as 'primary' | 'shared')}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                      disabled={!!unit?.primary_tenant}
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Primary Tenant
                      {unit?.primary_tenant && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(already assigned)</span>
                      )}
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="shared"
                      checked={assignmentType === 'shared'}
                      onChange={(e) => setAssignmentType(e.target.value as 'primary' | 'shared')}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Shared Access</span>
                  </label>
                </div>
              </div>

              {/* Tenant Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Tenant
                </label>
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Choose a tenant</option>
                  {availableTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.firstName} {tenant.lastName} ({tenant.email})
                    </option>
                  ))}
                </select>
              </div>

              {availableTenants.length === 0 && (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  <UserIcon className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">All available tenants are already assigned to this unit</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
          >
            Close
          </button>
          
          <button
            onClick={handleAssignTenant}
            disabled={!selectedTenant || loading}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            {loading ? 'Assigning...' : `Assign ${assignmentType === 'primary' ? 'Primary' : 'Shared'} Access`}
          </button>
        </div>
      </Modal>

      {/* Remove Confirmation Modal */}
      <ConfirmModal
        isOpen={!!showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(null)}
        onConfirm={() => showRemoveConfirm && handleRemoveTenant(showRemoveConfirm)}
        title="Remove Tenant Access"
        message="Are you sure you want to remove this tenant's access to the unit? This action cannot be undone."
        confirmText="Remove Access"
        cancelText="Cancel"
      />
    </>
  );
}

