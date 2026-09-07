/**
 * Modal for choosing which PDF page to rasterize before detection.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

interface PdfPagePickerProps {
  fileName: string;
  pageCount: number;
  onConfirm: (pageNumber: number) => void;
  onCancel: () => void;
}

export const PdfPagePicker: React.FC<PdfPagePickerProps> = ({
  fileName,
  pageCount,
  onConfirm,
  onCancel,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [page, setPage] = useState(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-page-picker-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
          isDark ? 'bg-gray-900' : 'bg-white'
        }`}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <DocumentIcon className="w-5 h-5 text-primary-500 flex-shrink-0" />
            <h2
              id="pdf-page-picker-title"
              className={`text-lg font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}
            >
              Select PDF page
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            <span className="font-medium">{fileName}</span> has {pageCount} pages. Which page
            contains the facility layout?
          </p>
          <label className={`block text-xs font-semibold uppercase tracking-wide ${
            isDark ? 'text-gray-500' : 'text-gray-400'
          }`}>
            Page number
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Page {n} of {pageCount}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className={`flex justify-end gap-2 px-5 py-4 border-t ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(page)}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            Continue
          </button>
        </div>
      </motion.div>
    </div>
  );
};
