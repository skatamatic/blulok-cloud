import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  emptyMessage = 'No matches found',
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const blurTimeoutRef = useRef<number | null>(null);
  const safeQuery = typeof query === 'string' ? query : '';
  const normalizedOptions = useMemo(
    () => options.map((option) => ({
      value: typeof option.value === 'string' ? option.value : '',
      label: typeof option.label === 'string' && option.label.trim().length > 0
        ? option.label
        : (typeof option.description === 'string' && option.description.trim().length > 0
          ? option.description
          : (typeof option.value === 'string' ? option.value : '')),
      description: typeof option.description === 'string' ? option.description : '',
      keywords: (option.keywords || []).filter((keyword): keyword is string => typeof keyword === 'string'),
    })),
    [options],
  );

  const selectedOption = useMemo(
    () => normalizedOptions.find((option) => option.value === value) || null,
    [normalizedOptions, value],
  );

  useEffect(() => {
    if (selectedOption) {
      setQuery(typeof selectedOption.label === 'string' ? selectedOption.label : '');
    }
  }, [selectedOption]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const normalized = safeQuery.trim().toLowerCase();
    const selectedLabel = selectedOption?.label.trim().toLowerCase() || '';
    if (!normalized || (selectedLabel && normalized === selectedLabel)) return normalizedOptions;
    return normalizedOptions.filter((option) => {
      const haystack = [
        option.label,
        option.description,
        ...option.keywords,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [normalizedOptions, safeQuery]);

  const handleSelect = (option: SearchableSelectOption) => {
    onChange(option.value);
    setQuery(typeof option.label === 'string' ? option.label : '');
    setIsOpen(false);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      if (!value) setQuery('');
    }, 120);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
      </div>
      <input
        type="text"
        value={safeQuery}
        onFocus={() => !disabled && setIsOpen(true)}
        onClick={() => !disabled && setIsOpen(true)}
        onBlur={handleBlur}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange('');
          if (!disabled) setIsOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  value === option.value ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">{option.label}</p>
                {option.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

