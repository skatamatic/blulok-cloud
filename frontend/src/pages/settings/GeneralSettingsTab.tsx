import { useState, useEffect } from 'react';
import { UserRole } from '@/types/auth.types';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';

const themeOptions = [
  { value: 'light' as const, label: 'Light', description: 'Clean and bright interface', icon: SunIcon },
  { value: 'dark' as const, label: 'Dark', description: 'Easy on the eyes in low light', icon: MoonIcon },
  { value: 'system' as const, label: 'System', description: 'Matches your device settings', icon: ComputerDesktopIcon },
];

const getRoleBadgeColor = (role: string): string => {
  switch (role) {
    case 'dev_admin': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'blulok_technician': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'maintenance': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

const formatRoleName = (role: string): string => {
  switch (role) {
    case 'dev_admin': return 'Dev Admin';
    case 'admin': return 'Admin';
    case 'blulok_technician': return 'BluLok Tech';
    case 'maintenance': return 'Maintenance';
    case 'tenant': return 'Tenant';
    default: return role;
  }
};

export default function GeneralSettingsTab() {
  const { theme, setTheme } = useTheme();
  const { authState } = useAuth();
  const { addToast } = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [maxDevicesPerUser, setMaxDevicesPerUser] = useState(2);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const clampDeviceLimit = (value: number) => {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(250, value));
  };

  useEffect(() => {
    const loadSettings = async () => {
      if (authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN) {
        setIsLoadingSettings(true);
        try {
          const response = await apiService.getSystemSettings();
          if (response.success) {
            setMaxDevicesPerUser(clampDeviceLimit(response.settings['security.max_devices_per_user']));
          }
        } catch (error) {
          console.error('Failed to load system settings:', error);
        } finally {
          setIsLoadingSettings(false);
        }
      }
    };
    loadSettings();
  }, [authState.user?.role]);

  const handleDeviceLimitChange = (rawValue: string) => {
    if (rawValue === '') { setMaxDevicesPerUser(0); return; }
    setMaxDevicesPerUser(clampDeviceLimit(parseInt(rawValue, 10)));
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await apiService.updateSystemSettings({ 'security.max_devices_per_user': maxDevicesPerUser });
      addToast({ type: response.success ? 'success' : 'error', title: response.success ? 'Security settings updated successfully' : 'Failed to update security settings' });
    } catch (error) {
      console.error('Failed to save system settings:', error);
      addToast({ type: 'error', title: 'An error occurred while updating settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleResetWidgets = async () => {
    setIsResetting(true);
    setResetMessage('');
    try {
      const response = await apiService.resetWidgetLayout();
      if (response.success) {
        setResetMessage('Widget layout reset successfully! Redirecting to dashboard...');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setResetMessage('Failed to reset widget layout. Please try again.');
      }
    } catch {
      setResetMessage('An error occurred while resetting widget layout.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Appearance */}
      <div className="card">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Appearance</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Customize how BluLok Cloud looks and feels</p>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`relative flex items-center space-x-3 rounded-lg border p-4 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200 ${
                  theme === option.value
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <option.icon className={`h-5 w-5 ${theme === option.value ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`} />
                <div className="flex-1 text-left">
                  <div className={`text-sm font-medium ${theme === option.value ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'}`}>{option.label}</div>
                  <div className={`text-xs ${theme === option.value ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>{option.description}</div>
                </div>
                {theme === option.value && (
                  <div className="text-primary-600 dark:text-primary-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dashboard Settings */}
      <div className="card">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Dashboard Settings</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Manage your dashboard layout and widget preferences</p>
          {resetMessage && (
            <div className={`rounded-md p-4 mb-6 ${resetMessage.includes('successfully') ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className={`text-sm ${resetMessage.includes('successfully') ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{resetMessage}</div>
            </div>
          )}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Reset Widget Layout</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Restore all widgets to their default positions and sizes.</p>
            </div>
            <button onClick={handleResetWidgets} disabled={isResetting} className="btn-secondary ml-4">
              {isResetting ? 'Resetting...' : 'Reset to Defaults'}
            </button>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      {(authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN) && (
        <div className="card">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              <div className="flex items-center"><ShieldCheckIcon className="h-5 w-5 text-gray-400 mr-2" /> Security Settings</div>
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Configure security policies and device access limits</p>
            {isLoadingSettings ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                <span className="ml-3 text-gray-600 dark:text-gray-400">Loading settings...</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label htmlFor="max-devices-per-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <div className="flex items-center"><DevicePhoneMobileIcon className="h-4 w-4 text-gray-400 mr-2" /> Maximum Devices Per User</div>
                  </label>
                  <div className="flex items-center space-x-4">
                    <input id="max-devices-per-user" type="number" min={0} max={250} value={maxDevicesPerUser} onChange={(e) => handleDeviceLimitChange(e.target.value)} className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" disabled={isSavingSettings} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {maxDevicesPerUser === 0 ? 'Unlimited devices enabled (0 = unlimited, max 250)' : 'devices (0 = unlimited, max 250)'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Limits how many app devices a user can register for key distribution</p>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleSaveSettings} disabled={isSavingSettings} className="btn-primary">
                    {isSavingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Information */}
      <div className="card">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">System Information</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Version</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">1.0.0</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Environment</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">Development</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">User Role</dt>
              <dd className="mt-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(authState.user?.role || UserRole.TENANT)}`}>
                  {formatRoleName(authState.user?.role || UserRole.TENANT)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{new Date().toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
