import { useState, useEffect } from 'react';
import { 
  CpuChipIcon,
  HomeIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { Modal } from '@/components/Modal/Modal';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';

interface Device {
  id: string;
  device_serial: string;
  firmware_version?: string;
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
  facility_name?: string;
  gateway_name?: string;
}

interface UnitForModal {
  id: string;
  unit_number: string;
  unit_type?: string;
  facility_id: string;
  blulok_device?: {
    id: string;
    device_serial: string;
    firmware_version?: string;
    device_status?: string;
    battery_level?: number;
  };
}

interface DeviceAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  unit: UnitForModal | null;
}

export function DeviceAssignmentModal({ isOpen, onClose, onSuccess, unit }: DeviceAssignmentModalProps) {
  const { addToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && unit) {
      loadUnassignedDevices();
    }
  }, [isOpen, unit]);

  const loadUnassignedDevices = async () => {
    if (!unit?.facility_id) return;

    try {
      setLoadingDevices(true);
      const response = await apiService.getUnassignedDevices(unit.facility_id);
      setDevices(response.devices || []);
    } catch (error) {
      console.error('Failed to load unassigned devices:', error);
      addToast({ type: 'error', title: 'Failed to load unassigned devices' });
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleAssignDevice = async () => {
    if (!selectedDevice || !unit) return;

    try {
      setLoading(true);
      await apiService.assignDeviceToUnit(selectedDevice, unit.id);
      addToast({ type: 'success', title: 'Device assigned to unit successfully' });
      onSuccess();
      setSelectedDevice('');
    } catch (error: any) {
      console.error('Failed to assign device:', error);
      addToast({ type: 'error', title: error?.response?.data?.message || 'Failed to assign device to unit' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnassignDevice = async () => {
    if (!unit?.blulok_device?.id) return;

    try {
      setLoading(true);
      await apiService.unassignDeviceFromUnit(unit.blulok_device.id);
      addToast({ type: 'success', title: 'Device unassigned from unit successfully' });
      onSuccess();
      setShowUnassignConfirm(false);
    } catch (error: any) {
      console.error('Failed to unassign device:', error);
      addToast({ type: 'error', title: error?.response?.data?.message || 'Failed to unassign device from unit' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangeDevice = async () => {
    if (!selectedDevice || !unit?.blulok_device?.id) return;

    try {
      setLoading(true);
      // First unassign the old device, then assign the new one
      // The backend handles this automatically, but we can also do it explicitly
      await apiService.unassignDeviceFromUnit(unit.blulok_device.id);
      await apiService.assignDeviceToUnit(selectedDevice, unit.id);
      addToast({ type: 'success', title: 'Device changed successfully' });
      onSuccess();
      setSelectedDevice('');
    } catch (error: any) {
      console.error('Failed to change device:', error);
      addToast({ type: 'error', title: error?.response?.data?.message || 'Failed to change device' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedDevice('');
    setShowUnassignConfirm(false);
    onClose();
  };

  const hasDevice = !!unit?.blulok_device;
  const isChangingDevice = hasDevice && !!selectedDevice;

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} size="lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
                <CpuChipIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {hasDevice ? 'Change Device Assignment' : 'Assign Device to Unit'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Unit {unit?.unit_number} - {unit?.unit_type}
                </p>
              </div>
            </div>
            {/* Close handled by Modal's built-in top-right button */}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="space-y-6">
            {/* Current Device Assignment */}
            {hasDevice && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Current Device</h4>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center">
                          <CpuChipIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                          {unit.blulok_device.device_serial}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          {unit.blulok_device.firmware_version && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Firmware: {unit.blulok_device.firmware_version}
                            </p>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            unit.blulok_device.device_status === 'online' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                            {unit.blulok_device.device_status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowUnassignConfirm(true)}
                      className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                      disabled={loading}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Select New Device */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                {hasDevice ? 'Select Replacement Device' : 'Select Device'}
              </h4>
              
              {loadingDevices ? (
                <div className="text-center py-8">
                  <ArrowPathIcon className="mx-auto h-8 w-8 text-gray-400 animate-spin" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading devices...</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Available Devices
                    </label>
                    <select
                      value={selectedDevice}
                      onChange={(e) => setSelectedDevice(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Choose a device</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.device_serial} 
                          {device.firmware_version && ` (v${device.firmware_version})`}
                          {device.facility_name && ` - ${device.facility_name}`}
                          {device.device_status && ` - ${device.device_status}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {devices.length === 0 && (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                      <CpuChipIcon className="mx-auto h-8 w-8 mb-2" />
                      <p className="text-sm">No unassigned devices available in this facility</p>
                    </div>
                  )}

                  {selectedDevice && (
                    <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      {(() => {
                        const device = devices.find(d => d.id === selectedDevice);
                        if (!device) return null;
                        return (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              Device Details
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <div>
                                <span className="font-medium">Serial:</span> {device.device_serial}
                              </div>
                              {device.firmware_version && (
                                <div>
                                  <span className="font-medium">Firmware:</span> {device.firmware_version}
                                </div>
                              )}
                              <div>
                                <span className="font-medium">Status:</span> {device.device_status}
                              </div>
                              {device.battery_level !== undefined && (
                                <div>
                                  <span className="font-medium">Battery:</span> {device.battery_level}%
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
          >
            Cancel
          </button>
          
          {hasDevice && selectedDevice && (
            <button
              onClick={handleChangeDevice}
              disabled={!selectedDevice || loading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4 mr-2" />
              {loading ? 'Changing...' : 'Change Device'}
            </button>
          )}
          
          {!hasDevice && (
            <button
              onClick={handleAssignDevice}
              disabled={!selectedDevice || loading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              {loading ? 'Assigning...' : 'Assign Device'}
            </button>
          )}
        </div>
      </Modal>

      {/* Unassign Confirmation Modal */}
      <ConfirmModal
        isOpen={showUnassignConfirm}
        onClose={() => setShowUnassignConfirm(false)}
        onConfirm={handleUnassignDevice}
        title="Unassign Device"
        message="Are you sure you want to unassign this device from the unit? The device will become available for other units."
        confirmText="Unassign"
        cancelText="Cancel"
      />
    </>
  );
}

