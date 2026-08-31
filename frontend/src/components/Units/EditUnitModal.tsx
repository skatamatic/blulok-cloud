import { useState, useEffect } from 'react';
import { BuildingOfficeIcon, PencilIcon } from '@heroicons/react/24/outline';
import { Modal } from '@/components/Modal/Modal';
import { apiService } from '@/services/api.service';
import { Unit } from '@/types/facility.types';

type VacantUnitStatus = 'available' | 'maintenance' | 'reserved';

interface EditUnitFormData {
  unit_number: string;
  status: VacantUnitStatus;
  description: string;
}

interface EditUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  unit: Unit | null;
}

function unitHasTenant(unit: Unit): boolean {
  return Boolean(
    unit.primary_tenant?.id || (unit.shared_tenants && unit.shared_tenants.length > 0)
  );
}

function vacantStatusFromUnit(unit: Unit): VacantUnitStatus {
  if (unit.status === 'maintenance' || unit.status === 'reserved') {
    return unit.status;
  }
  return 'available';
}

export function EditUnitModal({ isOpen, onClose, onSuccess, unit }: EditUnitModalProps) {
  const [formData, setFormData] = useState<EditUnitFormData>({
    unit_number: '',
    status: 'available',
    description: '',
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasTenant = unit ? unitHasTenant(unit) : false;

  useEffect(() => {
    if (isOpen && unit) {
      setFormData({
        unit_number: unit.unit_number || '',
        status: vacantStatusFromUnit(unit),
        description: unit.description || '',
      });
      setErrors({});
    }
    // Seed only on open / unit identity — live telemetry must not wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally ignore live telemetry props
  }, [isOpen, unit?.id]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.unit_number.trim()) {
      newErrors.unit_number = 'Unit number is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof EditUnitFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async () => {
    if (!validateForm() || !unit) return;

    try {
      setLoading(true);

      const payload: {
        unit_number: string;
        description: string;
        status?: VacantUnitStatus;
      } = {
        unit_number: formData.unit_number,
        description: formData.description,
      };

      if (!hasTenant) {
        payload.status = formData.status;
      }

      await apiService.updateUnit(unit.id, payload);

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Failed to update unit:', error);
      setErrors({ submit: 'Failed to update unit. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      unit_number: '',
      status: 'available',
      description: '',
    });
    setErrors({});
    onClose();
  };

  if (!unit) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      title="Edit Unit"
    >
      <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-xl">
            <PencilIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Unit
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Update unit number, status, and description
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Unit Details</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Facility
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={`Facility ${unit.facility_id}`}
                    disabled
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Facility cannot be changed after unit creation
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Unit Number *
                </label>
                <input
                  type="text"
                  value={formData.unit_number}
                  onChange={(e) => handleInputChange('unit_number', e.target.value)}
                  className={`block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.unit_number
                      ? 'border-red-300 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                  placeholder="e.g. A101, B-205"
                />
                {errors.unit_number && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.unit_number}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              {hasTenant ? (
                <div>
                  <input
                    type="text"
                    value="Occupied"
                    disabled
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-400 cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Status is occupied while tenants are assigned. Remove all tenants to change status.
                  </p>
                </div>
              ) : (
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value as VacantUnitStatus)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="available">Available</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="reserved">Reserved</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter unit description"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
        >
          Cancel
        </button>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Updating...' : 'Update Unit'}
        </button>
      </div>

      {errors.submit && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
        </div>
      )}
    </Modal>
  );
}
