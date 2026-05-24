import React, { useEffect, useRef, useState } from 'react';

export interface DashboardPageNameFieldProps {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  variant?: 'pager' | 'list';
  placeholder?: string;
  /** Focus and select all text (e.g. after adding a page). */
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
}

export const DashboardPageNameField: React.FC<DashboardPageNameFieldProps> = ({
  value,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  variant = 'pager',
  placeholder = 'Page name',
  autoFocus = false,
  onAutoFocusHandled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!isEditing || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
    if (autoFocus) onAutoFocusHandled?.();
  }, [isEditing, autoFocus, onAutoFocusHandled]);

  const commit = () => {
    skipBlurCommitRef.current = true;
    onCommit(draft);
  };

  const cancel = () => {
    skipBlurCommitRef.current = true;
    setDraft(value);
    onCancel();
  };

  const inputClass =
    variant === 'pager'
      ? 'w-full max-w-[220px] mx-auto text-center text-sm font-medium px-2 py-0.5 rounded-md border border-[#147FD4]/50 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#147FD4]/40'
      : 'w-full text-sm font-medium px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#147FD4]/40';

  const labelClass =
    variant === 'pager'
      ? 'text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px] hover:text-[#147FD4] dark:hover:text-[#147FD4] transition-colors cursor-text border-b border-transparent hover:border-[#147FD4]/30'
      : 'flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate text-left hover:text-[#147FD4] transition-colors cursor-text';

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          onCommit(draft);
        }}
        placeholder={placeholder}
        aria-label="Page name"
        className={inputClass}
        maxLength={64}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      className={labelClass}
      title="Click to rename page"
      aria-label={`Page name: ${value}. Click to edit.`}
    >
      {value}
    </button>
  );
};
