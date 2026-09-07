import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface FullscreenWidgetViewProps {
  isOpen: boolean;
  widgetTitle?: string;
  onExit: () => void;
  children: React.ReactNode;
}

export const FullscreenWidgetView: React.FC<FullscreenWidgetViewProps> = ({
  isOpen,
  widgetTitle,
  onExit,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onExit]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="fullscreen-widget"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 z-30 flex flex-col gap-4 bg-gray-50 p-4 dark:bg-gray-900"
          role="dialog"
          aria-modal="true"
          aria-label={widgetTitle ? `${widgetTitle} (fullscreen)` : 'Widget fullscreen'}
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-3">
            <motion.button
              type="button"
              onClick={onExit}
              whileTap={{ scale: 0.96 }}
              whileHover={{ x: -2 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-[#147FD4] hover:text-[#147FD4] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              aria-label="Exit fullscreen"
            >
              <ArrowLeftIcon className="h-4 w-4 shrink-0" />
              Back
            </motion.button>
            {widgetTitle && (
              <span className="flex-1 text-center text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Press Esc to exit
              </span>
            )}
            {/* Balance header layout so Back stays left-aligned */}
            <span className="w-[5.5rem] shrink-0" aria-hidden />
          </div>

          <motion.div
            layout
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-200/60 dark:bg-gray-900 dark:ring-gray-700/60"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
