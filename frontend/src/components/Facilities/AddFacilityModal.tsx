import { useState, useEffect } from 'react';
import { 
  BuildingOfficeIcon, 
  PhoneIcon, 
  EnvelopeIcon,
  XMarkIcon,
  ServerIcon,
  WifiIcon
} from '@heroicons/react/24/outline';
import { Modal } from '@/components/Modal/Modal';
import { apiService } from '@/services/api.service';
import { CreateFacilityData } from '@/types/facility.types';
import { AddressAutocomplete } from '@/components/GoogleMaps/AddressAutocomplete';
import { MapCard } from '@/components/GoogleMaps/MapCard';

interface AddFacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddFacilityModal({ isOpen, onClose, onSuccess }: AddFacilityModalProps) {
  const [formData, setFormData] = useState<CreateFacilityData>({
    name: '',
    description: '',
    address: '',
    latitude: undefined,
    longitude: undefined,
    branding_image: '',
    image_mime_type: '',
    contact_email: '',
    contact_phone: '',
    status: 'active'
  });
  
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'facility' | 'gateway'>('facility');
  const [gatewayData, setGatewayData] = useState({
    name: '',
    model: '',
    ip_address: '',
    mac_address: ''
  });

  useEffect(() => {
    // Auto-generate gateway name when facility name changes
    if (formData.name && !gatewayData.name) {
      setGatewayData(prev => ({
        ...prev,
        name: `${formData.name} Gateway`
      }));
    }
  }, [formData.name, gatewayData.name]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Facility name is required';
    }
    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }
    if (formData.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
      newErrors.contact_email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof CreateFacilityData, value: string | number | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNext = () => {
    if (validateForm()) {
      setStep('gateway');
    }
  };

  const validateGateway = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!gatewayData.name.trim()) {
      newErrors.gateway_name = 'Gateway name is required';
    }
    if (gatewayData.ip_address && !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(gatewayData.ip_address)) {
      newErrors.ip_address = 'Please enter a valid IP address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || (step === 'gateway' && !validateGateway())) return;

    try {
      setLoading(true);
      
      // Create facility
      const facilityResponse = await apiService.createFacility(formData);
      
      // Check if the response has the expected structure
      if (!facilityResponse || !facilityResponse.facility || !facilityResponse.facility.id) {
        console.error('Invalid facility creation response:', facilityResponse);
        setErrors({ submit: 'Failed to create facility. Invalid response from server.' });
        return;
      }
      
      const facilityId = facilityResponse.facility.id;

      // Create gateway for the facility
      if (step === 'gateway') {
        const gatewayPayload = {
          facility_id: facilityId,
          ...gatewayData,
          status: 'offline' // Default to offline until connected
        };
        
        await apiService.createGateway(gatewayPayload);
      }

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Failed to create facility:', error);
      setErrors({ submit: 'Failed to create facility. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, image: 'Image must be smaller than 5MB' }));
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, image: 'Please select a valid image file' }));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setFormData(prev => ({
          ...prev,
          branding_image: base64.split(',')[1], // Remove data:image/...;base64, prefix
          image_mime_type: file.type
        }));
        setErrors(prev => ({ ...prev, image: '' }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddressSelect = (address: string, lat?: number, lng?: number) => {
    setFormData(prev => ({
      ...prev,
      address,
      latitude: lat,
      longitude: lng
    }));
    setErrors(prev => ({ ...prev, address: '' }));
  };

  const handleClose = () => {
    setFormData({
      name: '',
      description: '',
      address: '',
      latitude: undefined,
      longitude: undefined,
      branding_image: '',
      image_mime_type: '',
      contact_email: '',
      contact_phone: '',
      status: 'active'
    });
    setGatewayData({
      name: '',
      model: '',
      ip_address: '',
      mac_address: ''
    });
    setErrors({});
    setStep('facility');
    onClose();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose} 
      size="xl"
      title={step === 'facility' ? 'Add New Facility' : 'Setup Gateway'}
    >
      <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-xl">
            {step === 'facility' ? (
              <BuildingOfficeIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            ) : (
              <ServerIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {step === 'facility' ? 'Add New Facility' : 'Setup Gateway'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {step === 'facility' 
                ? 'Create a new storage facility with location and contact details' 
                : 'Configure the network gateway for device communication'
              }
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {step === 'facility' ? (
          <div className="space-y-8">
            {/* Basic Information */}
            <div className="space-y-5">
              <h4 className="text-base font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Basic Information
              </h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Facility Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.name 
                        ? 'border-red-300 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                    placeholder="Enter facility name"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
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
                  placeholder="Enter facility description"
                />
              </div>
            </div>

            {/* Location Information */}
            <div className="space-y-5">
              <h4 className="text-base font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Location
              </h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Address *
                </label>
                <AddressAutocomplete
                  value={formData.address}
                  onChange={handleAddressSelect}
                  placeholder="Enter facility address"
                  error={errors.address}
                />
              </div>

              {/* Map Preview */}
              {formData.latitude && formData.longitude && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Location Preview
                  </label>
                  <MapCard
                    address={formData.address}
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    facilityName={formData.name}
                    height="h-48"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude || ''}
                    onChange={(e) => handleInputChange('latitude', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. 40.7128"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude || ''}
                    onChange={(e) => handleInputChange('longitude', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. -74.0060"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-5">
              <h4 className="text-base font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Contact Information
              </h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contact Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => handleInputChange('contact_email', e.target.value)}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                        errors.contact_email 
                          ? 'border-red-300 dark:border-red-600' 
                          : 'border-gray-300 dark:border-gray-600'
                      } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                      placeholder="contact@facility.com"
                    />
                  </div>
                  {errors.contact_email && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.contact_email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contact Phone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <PhoneIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => handleInputChange('contact_phone', e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Branding */}
            <div className="space-y-5">
              <h4 className="text-base font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Branding
              </h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Facility Logo/Image
                </label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/20 dark:file:text-primary-400 dark:hover:file:bg-primary-900/40"
                    />
                  </div>
                  
                  {/* Image Preview */}
                  {formData.branding_image && (
                    <div className="relative">
                      <img
                        src={`data:${formData.image_mime_type};base64,${formData.branding_image}`}
                        alt="Facility branding preview"
                        className="h-24 w-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, branding_image: '', image_mime_type: '' }))}
                        className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  
                  {errors.image && <p className="text-sm text-red-600 dark:text-red-400">{errors.image}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Upload a logo or image for this facility (max 5MB)
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
              <ServerIcon className="mx-auto h-12 w-12 text-blue-500 mb-3" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Setup Gateway</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configure the network gateway that will manage all devices at this facility
              </p>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Gateway Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <ServerIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={gatewayData.name}
                      onChange={(e) => setGatewayData(prev => ({ ...prev, name: e.target.value }))}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                        errors.gateway_name 
                          ? 'border-red-300 dark:border-red-600' 
                          : 'border-gray-300 dark:border-gray-600'
                      } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                      placeholder="e.g. Downtown Storage Gateway"
                    />
                  </div>
                  {errors.gateway_name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.gateway_name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Gateway Model
                  </label>
                  <input
                    type="text"
                    value={gatewayData.model}
                    onChange={(e) => setGatewayData(prev => ({ ...prev, model: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. BG-2024-Pro"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    IP Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <WifiIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={gatewayData.ip_address}
                      onChange={(e) => setGatewayData(prev => ({ ...prev, ip_address: e.target.value }))}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                        errors.ip_address 
                          ? 'border-red-300 dark:border-red-600' 
                          : 'border-gray-300 dark:border-gray-600'
                      } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                      placeholder="192.168.1.100"
                    />
                  </div>
                  {errors.ip_address && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.ip_address}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    MAC Address
                  </label>
                  <input
                    type="text"
                    value={gatewayData.mac_address}
                    onChange={(e) => setGatewayData(prev => ({ ...prev, mac_address: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="AA:BB:CC:DD:EE:FF"
                  />
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <WifiIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                      Gateway Information
                    </h5>
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      The gateway serves as the central hub for all devices at this facility. 
                      It manages communication between BluLok devices, access control systems, and the cloud platform.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-8 py-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        {step === 'gateway' && (
          <button
            onClick={() => setStep('facility')}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
          >
            Back
          </button>
        )}
        
        <div className="flex space-x-3 ml-auto">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
          >
            Cancel
          </button>
          
          {step === 'facility' ? (
            <button
              onClick={handleNext}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              Next: Setup Gateway
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Facility & Gateway'}
            </button>
          )}
        </div>
      </div>

      {errors.submit && (
        <div className="px-8 py-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
        </div>
      )}
    </Modal>
  );
}
