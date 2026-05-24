import { useState } from 'react';
import { apiService } from '@/services/api.service';

export function PersonalDashboardSettingsSection() {
  const [isResettingDefaults, setIsResettingDefaults] = useState(false);
  const [isClearingPersonal, setIsClearingPersonal] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const handleResetToDefaults = async () => {
    setIsResettingDefaults(true);
    setResetMessage('');
    try {
      const response = await apiService.resetWidgetLayoutDefaults();
      if (response.success) {
        setResetMessage('Widget layout reset to system defaults. Redirecting to dashboard...');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setResetMessage('Failed to reset widget layout. Please try again.');
      }
    } catch {
      setResetMessage('An error occurred while resetting widget layout.');
    } finally {
      setIsResettingDefaults(false);
    }
  };

  const handleClearPersonalLayout = async () => {
    setIsClearingPersonal(true);
    setResetMessage('');
    try {
      const response = await apiService.resetWidgetLayout();
      if (response.success) {
        setResetMessage('Personal layout cleared. Redirecting to dashboard...');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setResetMessage('Failed to clear personal layout. Please try again.');
      }
    } catch {
      setResetMessage('An error occurred while clearing personal layout.');
    } finally {
      setIsClearingPersonal(false);
    }
  };

  return (
    <div className="card">
      <div className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Personal layout</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Manage your personal dashboard layout or restore role defaults.
        </p>
        {resetMessage && (
          <div
            className={`rounded-md p-4 mb-6 ${
              resetMessage.includes('Redirecting')
                ? 'bg-green-50 dark:bg-green-900/20'
                : 'bg-red-50 dark:bg-red-900/20'
            }`}
          >
            <div
              className={`text-sm ${
                resetMessage.includes('Redirecting')
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {resetMessage}
            </div>
          </div>
        )}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Revert to assigned layout
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Clear your personal working layout and show the organization-assigned template
                (or role defaults).
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearPersonalLayout}
              disabled={isClearingPersonal}
              className="btn-secondary ml-4 shrink-0"
            >
              {isClearingPersonal ? 'Clearing...' : 'Clear personal layout'}
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Reset to system defaults
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Replace your working layout with the built-in widget templates for your role.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetToDefaults}
              disabled={isResettingDefaults}
              className="btn-secondary ml-4 shrink-0"
            >
              {isResettingDefaults ? 'Resetting...' : 'Reset to defaults'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
