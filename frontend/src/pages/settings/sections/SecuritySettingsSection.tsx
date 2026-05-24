import { useState, useEffect } from 'react';
import { UserRole } from '@/types/auth.types';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { ShieldCheckIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';

export function SecuritySettingsSection() {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const [maxDevicesPerUser, setMaxDevicesPerUser] = useState(2);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const clampDeviceLimit = (value: number) => {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(250, value));
  };

  useEffect(() => {
    const loadSettings = async () => {
      if (
        authState.user?.role === UserRole.ADMIN ||
        authState.user?.role === UserRole.DEV_ADMIN
      ) {
        setIsLoadingSettings(true);
        try {
          const response = await apiService.getSystemSettings();
          if (response.success) {
            setMaxDevicesPerUser(
              clampDeviceLimit(response.settings['security.max_devices_per_user'])
            );
          }
        } catch (error) {
          console.error('Failed to load system settings:', error);
        } finally {
          setIsLoadingSettings(false);
        }
      }
    };
    void loadSettings();
  }, [authState.user?.role]);

  const handleDeviceLimitChange = (rawValue: string) => {
    if (rawValue === '') {
      setMaxDevicesPerUser(0);
      return;
    }
    setMaxDevicesPerUser(clampDeviceLimit(parseInt(rawValue, 10)));
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await apiService.updateSystemSettings({
        'security.max_devices_per_user': maxDevicesPerUser,
      });
      addToast({
        type: response.success ? 'success' : 'error',
        title: response.success
          ? 'Security settings updated successfully'
          : 'Failed to update security settings',
      });
    } catch (error) {
      console.error('Failed to save system settings:', error);
      addToast({ type: 'error', title: 'An error occurred while updating settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="card">
      <div className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          <div className="flex items-center">
            <ShieldCheckIcon className="h-5 w-5 text-gray-400 mr-2" /> Security Settings
          </div>
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure security policies and device access limits
        </p>
        {isLoadingSettings ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading settings...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label
                htmlFor="max-devices-per-user"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                <div className="flex items-center">
                  <DevicePhoneMobileIcon className="h-4 w-4 text-gray-400 mr-2" /> Maximum Devices
                  Per User
                </div>
              </label>
              <div className="flex items-center space-x-4">
                <input
                  id="max-devices-per-user"
                  type="number"
                  min={0}
                  max={250}
                  value={maxDevicesPerUser}
                  onChange={(e) => handleDeviceLimitChange(e.target.value)}
                  className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isSavingSettings}
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {maxDevicesPerUser === 0
                    ? 'Unlimited devices enabled (0 = unlimited, max 250)'
                    : 'devices (0 = unlimited, max 250)'}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Limits how many app devices a user can register for key distribution
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={isSavingSettings}
                className="btn-primary"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
