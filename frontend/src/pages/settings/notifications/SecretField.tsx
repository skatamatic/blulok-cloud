import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { SECRET_MASK } from '@/types/notification.types';

interface SecretFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
}

/**
 * Password-style input that treats the API mask sentinel as "unchanged".
 * When the user focuses a masked field, the value clears so they can type a new secret.
 */
export function SecretField({ id, label, value, onChange, placeholder, helpText }: SecretFieldProps) {
  const [show, setShow] = useState(false);
  const isMasked = value === SECRET_MASK;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show && !isMasked ? 'text' : 'password'}
          value={value || ''}
          onFocus={() => {
            if (isMasked) onChange('');
          }}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isMasked ? 'Leave blank to keep existing' : placeholder}
          className="w-full pr-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          disabled={isMasked}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
        >
          {show ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      {helpText && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helpText}</p>
      )}
    </div>
  );
}

export type SetConfig = Dispatch<SetStateAction<import('@/types/notification.types').NotificationsConfig>>;

export function useConfigPathUpdater(setConfig: SetConfig) {
  return useCallback(
    (path: string, value: unknown) => {
      setConfig((prev) => {
        const newConfig = { ...prev };
        const keys = path.split('.');
        let current: Record<string, unknown> = newConfig as unknown as Record<string, unknown>;
        for (let i = 0; i < keys.length - 1; i++) {
          const next = current[keys[i]];
          if (!next || typeof next !== 'object') {
            current[keys[i]] = {};
          }
          current = current[keys[i]] as Record<string, unknown>;
        }
        current[keys[keys.length - 1]] = value;
        return newConfig;
      });
    },
    [setConfig],
  );
}
