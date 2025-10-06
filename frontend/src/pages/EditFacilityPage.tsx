import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  PhoneIcon, 
  EnvelopeIcon,
  ArrowLeftIcon,
  PhotoIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Facility } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'maintenance', label: 'Maintenance' }
];

export default function EditFacilityPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { authState } = useAuth();
  
  const [facility, setFacility] = useState<Facility | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    contact_email: '',
    contact_phone: '',
    status: 'active' as 'active' | 'inactive' | 'maintenance',
    branding_image: null as File | null,
    image_mime_type: ''
  });

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  useEffect(() => {
    if (id && canManage) {
      loadFacility();
    } else if (!canManage) {
      navigate('/facilities');
    }
  }, [id, canManage, navigate]);

  const loadFacility = async () => {
    try {
      setLoading(true);
      const response = await apiService.getFacility(id!);
      if (response.success && response.facility) {
        const facilityData = response.facility;
        setFacility(facilityData);
        setFormData({
          name: facilityData.name || '',
          description: facilityData.description || '',
          address: facilityData.address || '',
          city: facilityData.city || '',
          state: facilityData.state || '',
          zip_code: facilityData.zip_code || '',
          contact_email: facilityData.contact_email || '',
          contact_phone: facilityData.contact_phone || '',
          status: facilityData.status || 'active',
          branding_image: null,
          image_mime_type: facilityData.image_mime_type || ''
        });
      } else {
        setError('Facility not found');
      }
    } catch (error) {
      console.error('Failed to load facility:', error);
      setError('Failed to load facility details');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image file size must be less than 5MB');
        return;
      }
      
      setFormData(prev => ({
        ...prev,
        branding_image: file,
        image_mime_type: file.type
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facility) return;

    try {
      setSaving(true);
      setError('');
      
      // Prepare form data
      const submitData = new FormData();
      submitData.append('name', formData.name);
      submitData.append('description', formData.description);
      submitData.append('address', formData.address);
      submitData.append('city', formData.city);
      submitData.append('state', formData.state);
      submitData.append('zip_code', formData.zip_code);
      submitData.append('contact_email', formData.contact_email);
      submitData.append('contact_phone', formData.contact_phone);
      submitData.append('status', formData.status);
      
      if (formData.branding_image) {
        submitData.append('branding_image', formData.branding_image);
        submitData.append('image_mime_type', formData.image_mime_type);
      }

      const response = await apiService.updateFacility(facility.id, submitData);
      
      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate(`/facilities/${facility.id}`);
        }, 1500);
      } else {
        setError(response.message || 'Failed to update facility');
      }
    } catch (error) {
      console.error('Failed to update facility:', error);
      setError('Failed to update facility. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Facility not found</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The facility you're looking for doesn't exist or you don't have permission to edit it.
        </p>
        <div className="mt-6">
          <button
            onClick={() => navigate('/facilities')}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Facilities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(`/facilities/${facility.id}`)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Facility</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Update facility information and settings
            </p>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-5 w-5 text-green-400" />
            </div>
            <div className="ml-3">
              <div className="text-sm text-green-700 dark:text-green-400">
                Facility updated successfully! Redirecting...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Basic Information */}
          <div className="card p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Basic Information</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Facility Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="input"
                  placeholder="Enter facility name"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="input"
                  placeholder="Enter facility description"
                />
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="input"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Location Information */}
          <div className="card p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Location</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Address *
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  required
                  className="input"
                  placeholder="Enter street address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    City *
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    required
                    className="input"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    State *
                  </label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    required
                    className="input"
                    placeholder="State"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="zip_code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ZIP Code *
                </label>
                <input
                  type="text"
                  id="zip_code"
                  name="zip_code"
                  value={formData.zip_code}
                  onChange={handleInputChange}
                  required
                  className="input"
                  placeholder="ZIP Code"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Contact Information</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <EnvelopeIcon className="h-4 w-4 inline mr-1" />
                Email
              </label>
              <input
                type="email"
                id="contact_email"
                name="contact_email"
                value={formData.contact_email}
                onChange={handleInputChange}
                className="input"
                placeholder="contact@facility.com"
              />
            </div>
            <div>
              <label htmlFor="contact_phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <PhoneIcon className="h-4 w-4 inline mr-1" />
                Phone
              </label>
              <input
                type="tel"
                id="contact_phone"
                name="contact_phone"
                value={formData.contact_phone}
                onChange={handleInputChange}
                className="input"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>

        {/* Branding Image */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Branding Image</h3>
          <div className="space-y-4">
            {/* Current Image */}
            {facility.branding_image && facility.image_mime_type && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Image
                </label>
                <div className="flex items-center space-x-4">
                  <img
                    src={`data:${facility.image_mime_type};base64,${facility.branding_image}`}
                    alt="Current facility image"
                    className="h-20 w-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                  />
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Upload a new image to replace the current one
                  </div>
                </div>
              </div>
            )}

            {/* New Image Upload */}
            <div>
              <label htmlFor="branding_image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <PhotoIcon className="h-4 w-4 inline mr-1" />
                {facility.branding_image ? 'Replace Image' : 'Upload Image'}
              </label>
              <input
                type="file"
                id="branding_image"
                name="branding_image"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/20 dark:file:text-primary-400"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                PNG, JPG, GIF up to 5MB. Recommended size: 400x200px
              </p>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => navigate(`/facilities/${facility.id}`)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-6 py-2 text-sm font-medium"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}




