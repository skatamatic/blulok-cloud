import { FACILITY_TIMEZONE_OPTIONS } from '@/constants/facility-timezones';

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  id?: string;
  name?: string;
}

const SELECT_CLASS =
  'block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white';

export function TimezoneSelect({
  value,
  onChange,
  required = false,
  error,
  id = 'timezone',
  name = 'timezone',
}: TimezoneSelectProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Timezone{required ? ' *' : ''}
      </label>
      <select
        id={id}
        name={name}
        aria-label="Timezone"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${SELECT_CLASS} ${
          error ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <option value="">Select timezone</option>
        {FACILITY_TIMEZONE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Used for dates and invite expiry in SMS and email templates.
      </p>
      {error ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
