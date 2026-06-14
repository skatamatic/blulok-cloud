import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  fields: PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function PromptDialog({
  isOpen,
  title,
  message,
  fields,
  confirmLabel = 'Submit',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const panelRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = field.defaultValue ?? '';
    }
    setValues(initial);
  }, [isOpen, fields]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const firstInput = panelRef.current.querySelector<HTMLElement>('input, textarea');
    firstInput?.focus();
  }, [isOpen, fields]);

  if (!isOpen) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    for (const field of fields) {
      if (field.required !== false && !values[field.key]?.trim()) {
        return;
      }
    }
    onConfirm(values);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h3
            id="prompt-dialog-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {title}
          </h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          {message ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
          ) : null}
          {fields.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`prompt-field-${field.key}`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {field.label}
              </label>
              <input
                id={`prompt-field-${field.key}`}
                type="text"
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#147FD4]/50 focus:border-[#147FD4]"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button
            type="button"
            data-prompt-dialog-cancel
            onClick={onCancel}
            className="btn-secondary !px-3 !py-2"
          >
            {cancelLabel}
          </button>
          <button type="submit" className="btn-primary !px-3 !py-2">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
