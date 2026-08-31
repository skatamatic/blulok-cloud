import { useTheme } from '@/contexts/ThemeContext';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

const themeOptions = [
  { value: 'light' as const, label: 'Light', description: 'Clean and bright interface', icon: SunIcon },
  { value: 'dark' as const, label: 'Dark', description: 'Easy on the eyes in low light', icon: MoonIcon },
  { value: 'system' as const, label: 'System', description: 'Matches your device settings', icon: ComputerDesktopIcon },
];

export function AppearanceSettingsSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="card">
      <div className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Appearance</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Customize how BluLok Cloud looks and feels
        </p>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={`relative flex items-center space-x-3 rounded-lg border p-4 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200 ${
                theme === option.value
                  ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              <option.icon
                className={`h-5 w-5 ${
                  theme === option.value
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              />
              <div className="flex-1 text-left">
                <div
                  className={`text-sm font-medium ${
                    theme === option.value
                      ? 'text-primary-900 dark:text-primary-100'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {option.label}
                </div>
                <div
                  className={`text-xs ${
                    theme === option.value
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {option.description}
                </div>
              </div>
              {theme === option.value && (
                <div className="text-primary-600 dark:text-primary-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
