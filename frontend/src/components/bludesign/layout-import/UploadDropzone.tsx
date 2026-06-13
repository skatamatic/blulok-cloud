/**
 * BluDesign Layout Import — Upload dropzone
 *
 * Initial state of the import workflow: drag-and-drop or browse for a PNG/JPG/
 * WEBP/PDF site plan. Purely presentational; the parent owns processing.
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpTrayIcon,
  DocumentArrowUpIcon,
  PhotoIcon,
  DocumentIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { ACCEPTED_FILE_TYPES } from './loadSource';

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ onFile, disabled }) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFile(files[0]);
    },
    [onFile]
  );

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragging(true);
    },
    [disabled]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  }, [disabled]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget;
    if (related instanceof Node && e.currentTarget.contains(related)) return;
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const openFilePicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label="Upload a facility plan"
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFilePicker();
            }
          }}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`
            group relative w-full flex flex-col items-center justify-center gap-4
            rounded-2xl border-2 border-dashed px-8 py-16 text-center outline-none
            transition-colors duration-200
            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2'}
            ${isDragging
              ? 'border-primary-500 bg-primary-500/10'
              : isDark
                ? 'border-gray-700 bg-gray-800/40 hover:border-primary-500/60 hover:bg-gray-800/70'
                : 'border-gray-300 bg-white hover:border-primary-500/60 hover:bg-primary-50/40'
            }
          `}
        >
          {/* Decorative content must not steal drag hit-testing from the zone. */}
          <div className="pointer-events-none flex flex-col items-center gap-4">
            <div
              className={`
                flex items-center justify-center w-16 h-16 rounded-2xl
                transition-transform duration-200 group-hover:scale-110
                ${isDragging
                  ? 'bg-primary-500 text-white'
                  : isDark ? 'bg-gray-700 text-primary-400' : 'bg-primary-50 text-primary-500'
                }
              `}
            >
              {isDragging ? (
                <DocumentArrowUpIcon className="w-8 h-8" />
              ) : (
                <ArrowUpTrayIcon className="w-8 h-8" />
              )}
            </div>

            <div>
              <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {isDragging ? 'Drop to import' : 'Upload a facility plan'}
              </p>
              <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Drag &amp; drop, or{' '}
                <span className="text-primary-500 font-medium">browse</span> your files
              </p>
            </div>

            <div className={`flex items-center gap-4 mt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <span className="flex items-center gap-1.5">
                <PhotoIcon className="w-4 h-4" /> PNG · JPG · WEBP
              </span>
              <span className="flex items-center gap-1.5">
                <DocumentIcon className="w-4 h-4" /> PDF
              </span>
              <span>Up to 25 MB</span>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </motion.div>
    </div>
  );
};
