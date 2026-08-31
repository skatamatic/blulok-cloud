/**
 * Save Dialog
 * 
 * Modal dialog for saving facilities.
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export interface SaveDialogProps {
  isOpen: boolean;
  currentName?: string;
  thumbnail?: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

export const SaveDialog: React.FC<SaveDialogProps> = ({
  isOpen,
  currentName,
  thumbnail,
  onSave,
  onCancel,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [name, setName] = useState(currentName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(currentName || '');
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, currentName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a facility name');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await onSave(name.trim());
      // Dialog will be closed by parent
    } catch (err: any) {
      setError(err.message || 'Failed to save facility');
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSaving) {
      handleSave();
    } else if (e.key === 'Escape' && !isSaving) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60"
      onClick={() => !isSaving && onCancel()}
    >
      <div
        className={`rounded-lg shadow-2xl border max-w-md w-full mx-4 ${
          isDark ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <h2 className="text-lg font-semibold">
            {currentName ? 'Save Facility' : 'Save As New Facility'}
          </h2>
          <button
            className={`${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'} transition-colors disabled:opacity-50`}
            onClick={onCancel}
            disabled={isSaving}
          >
            <XCircleIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Thumbnail preview */}
          {thumbnail && (
            <div className={`rounded border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <img
                src={thumbnail}
                alt="Facility preview"
                className="w-full h-32 object-cover"
              />
            </div>
          )}

          {/* Name input */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Facility Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter facility name..."
              autoFocus
              disabled={isSaving}
              className={`w-full px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t flex justify-end gap-3 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              isDark
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
              isSaving
                ? 'bg-primary-600 text-white opacity-75 cursor-wait'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveDialog;



