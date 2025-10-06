import { useState, useEffect } from 'react';
import { 
  ServerIcon,
  BoltIcon,
  CubeIcon,
  KeyIcon,
  LockClosedIcon,
  BuildingOfficeIcon,
  HomeIcon,
  WifiIcon
} from '@heroicons/react/24/outline';
import { Modal } from '@/components/Modal/Modal';
import { apiService } from '@/services/api.service';
import { Facility, Unit } from '@/types/facility.types';

interface CreateAccessControlDeviceData {
  gateway_id: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description: string;
  relay_channel: number;
  device_settings?: Record<string, any>;
}

interface CreateBluLokDeviceData {
  gateway_id: string;
  unit_id: string;
  device_serial: string;
  firmware_version: string;
  device_settings?: Record<string, any>;
}

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  facilityId?: string;
  deviceType?: 'access_control' | 'blulok';
}

const DEVICE_TYPES = [
  { value: 'gate', label: 'Gate Controller', icon: BoltIcon },
  { value: 'elevator', label: 'Elevator Controller', icon: CubeIcon },
  { value: 'door', label: 'Door Controller', icon: KeyIcon }
];

export function AddDeviceModal({ isOpen, onClose, onSuccess, facilityId, deviceType = 'access_control' }: AddDeviceModalProps) {
  const [selectedDeviceType, setSelectedDeviceType] = useState<'access_control' | 'blulok'>(deviceType);
  
  const [accessControlData, setAccessControlData] = useState<CreateAccessControlDeviceData>({
    gateway_id: '',
    name: '',
    device_type: 'gate',
    location_description: '',
    relay_channel: 1,
    device_settings: {}
  });

  const [bluLokData, setBluLokData] = useState<CreateBluLokDeviceData>({
    gateway_id: '',
    unit_id: '',
    device_serial: '',
    firmware_version: '',
    device_settings: {}
  });
  
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<string>(facilityId || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadFacilities();
      if (selectedFacility) {
        loadUnits(selectedFacility);
      }
    }
  }, [isOpen, selectedFacility]);

  const loadFacilities = async () => {
    try {
      const response = await apiService.getFacilities();
      setFacilities(response.facilities || []);
    } catch (error) {
      console.error('Failed to load facilities:', error);
    }
  };

  const loadUnits = async (facilityId: string) => {
    try {
      const response = await apiService.getUnits({ facility_id: facilityId });
      setUnits(response.units || []);
    } catch (error) {
      console.error('Failed to load units:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (selectedDeviceType === 'access_control') {
      if (!accessControlData.gateway_id) {
        newErrors.gateway_id = 'Please select a facility (gateway will be auto-selected)';
      }
      if (!accessControlData.name.trim()) {
        newErrors.name = 'Device name is required';
      }
      if (!accessControlData.device_type) {
        newErrors.device_type = 'Device type is required';
      }
      if (!accessControlData.relay_channel || accessControlData.relay_channel < 1) {
        newErrors.relay_channel = 'Relay channel must be 1 or greater';
      }
    } else {
      if (!bluLokData.gateway_id) {
        newErrors.gateway_id = 'Please select a facility (gateway will be auto-selected)';
      }
      if (!bluLokData.unit_id) {
        newErrors.unit_id = 'Please select a unit';
      }
      if (!bluLokData.device_serial.trim()) {
        newErrors.device_serial = 'Device serial number is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFacilityChange = async (facilityId: string) => {
    setSelectedFacility(facilityId);
    
    // For now, we'll use the facility ID as the gateway ID
    // In a real implementation, you'd fetch the actual gateway for this facility
    if (selectedDeviceType === 'access_control') {
      setAccessControlData(prev => ({ ...prev, gateway_id: facilityId }));
    } else {
      setBluLokData(prev => ({ ...prev, gateway_id: facilityId }));
    }

    if (facilityId) {
      await loadUnits(facilityId);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      if (selectedDeviceType === 'access_control') {
        await apiService.createAccessControlDevice(accessControlData);
      } else {
        await apiService.createBluLokDevice(bluLokData);
      }

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Failed to create device:', error);
      setErrors({ submit: 'Failed to create device. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAccessControlData({
      gateway_id: '',
      name: '',
      device_type: 'gate',
      location_description: '',
      relay_channel: 1,
      device_settings: {}
    });
    setBluLokData({
      gateway_id: '',
      unit_id: '',
      device_serial: '',
      firmware_version: '',
      device_settings: {}
    });
    setSelectedFacility(facilityId || '');
    setErrors({});
    onClose();
  };

  const selectedFacilityName = facilities.find(f => f.id === selectedFacility)?.name || '';

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose} 
      size="xl"
      title="Add New Device"
    >
      <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-xl">
            <ServerIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Add New Device
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create a new {selectedDeviceType === 'access_control' ? 'access control' : 'BluLok'} device
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="space-y-6">
          {/* Device Type Selection */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Device Type</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedDeviceType('access_control')}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  selectedDeviceType === 'access_control'
                    ? 'border-primary-200 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <BoltIcon className={`h-6 w-6 ${
                    selectedDeviceType === 'access_control' 
                      ? 'text-primary-600 dark:text-primary-400' 
                      : 'text-gray-400'
                  }`} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Access Control</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gates, doors, elevators</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDeviceType('blulok')}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  selectedDeviceType === 'blulok'
                    ? 'border-primary-200 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <LockClosedIcon className={`h-6 w-6 ${
                    selectedDeviceType === 'blulok' 
                      ? 'text-primary-600 dark:text-primary-400' 
                      : 'text-gray-400'
                  }`} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">BluLok Device</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Smart unit locks</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Facility Selection */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Location</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Facility *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  value={selectedFacility}
                  onChange={(e) => handleFacilityChange(e.target.value)}
                  className={`block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.gateway_id 
                      ? 'border-red-300 dark:border-red-600' 
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                  disabled={!!facilityId}
                >
                  <option value="">Select a facility</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name}
                    </option>
                  ))}
                </select>
              </div>
              {errors.gateway_id && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.gateway_id}</p>}
            </div>

            {selectedFacilityName && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center space-x-2">
                  <WifiIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Will connect to gateway at <strong>{selectedFacilityName}</strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Device-specific fields */}
          {selectedDeviceType === 'access_control' ? (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Access Control Device Details</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Device Name *
                  </label>
                  <input
                    type="text"
                    value={accessControlData.name}
                    onChange={(e) => setAccessControlData(prev => ({ ...prev, name: e.target.value }))}
                    className={`block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.name 
                        ? 'border-red-300 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                    placeholder="e.g. Main Gate, Front Door"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Device Type *
                  </label>
                  <select
                    value={accessControlData.device_type}
                    onChange={(e) => setAccessControlData(prev => ({ ...prev, device_type: e.target.value as any }))}
                    className={`block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.device_type 
                        ? 'border-red-300 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                  >
                    {DEVICE_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {errors.device_type && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.device_type}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Relay Channel *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={accessControlData.relay_channel}
                    onChange={(e) => setAccessControlData(prev => ({ ...prev, relay_channel: parseInt(e.target.value) || 1 }))}
                    className={`block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.relay_channel 
                        ? 'border-red-300 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                    placeholder="1"
                  />
                  {errors.relay_channel && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.relay_channel}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Location Description
                </label>
                <input
                  type="text"
                  value={accessControlData.location_description}
                  onChange={(e) => setAccessControlData(prev => ({ ...prev, location_description: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. Building A entrance, Parking gate"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">BluLok Device Details</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Unit *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <HomeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    value={bluLokData.unit_id}
                    onChange={(e) => setBluLokData(prev => ({ ...prev, unit_id: e.target.value }))}
                    className={`block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.unit_id 
                        ? 'border-red-300 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                  >
                    <option value="">Select a unit</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        Unit {unit.unit_number} - {unit.unit_type}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.unit_id && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.unit_id}</p>}
                {!selectedFacility && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Please select a facility first to see available units
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Device Serial Number *
                  </label>
                  <input
                    type="text"
                    value={bluLokData.device_serial}
                    onChange={(e) => setBluLokData(prev => ({ ...prev, device_serial: e.target.value }))}
                    className={`block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.device_serial 
                        ? 'border-red-300 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                    placeholder="e.g. BL-2024-001234"
                  />
                  {errors.device_serial && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.device_serial}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Firmware Version
                  </label>
                  <input
                    type="text"
                    value={bluLokData.firmware_version}
                    onChange={(e) => setBluLokData(prev => ({ ...prev, firmware_version: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. v2.1.0"
                  />
                </div>
              </div>
            </div>
          )}
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
          {loading ? 'Creating...' : `Create ${selectedDeviceType === 'access_control' ? 'Access Control' : 'BluLok'} Device`}
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
