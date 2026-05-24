import React, { useEffect, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export interface DashboardPageNavigatorProps {
  pageCount: number;
  activeIndex: number;
  pageNames: string[];
  onSelectPage: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

const navButtonClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/90 text-gray-600 shadow-sm ring-1 ring-gray-200/80 backdrop-blur-sm transition-all duration-200 hover:bg-white hover:text-[#147FD4] hover:ring-[#147FD4]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#147FD4]/45 dark:bg-gray-900/90 dark:text-gray-300 dark:ring-gray-700/80 dark:hover:bg-gray-800 dark:hover:text-[#5eb3f0]';

/** Bottom pager: prev / dots / next. Page add/rename lives in dashboard settings. */
export const DashboardPageNavigator: React.FC<DashboardPageNavigatorProps> = ({
  pageCount,
  activeIndex,
  pageNames,
  onSelectPage,
  onPrev,
  onNext,
}) => {
  if (pageCount <= 1) {
    return null;
  }

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < pageCount - 1;
  const activeName = pageNames[activeIndex] ?? `Page ${activeIndex + 1}`;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft' && canGoPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        onNext();
      }
    },
    [canGoPrev, canGoNext, onPrev, onNext],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="mt-2 flex flex-shrink-0 flex-col items-center gap-1">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Dashboard: ${activeName}`}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canGoPrev}
          aria-label="Previous dashboard page"
          className={`${navButtonClass} ${!canGoPrev ? 'invisible pointer-events-none' : ''}`}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-0" role="tablist" aria-label="Dashboard pages">
          {Array.from({ length: pageCount }).map((_, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={pageNames[index] ?? index}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${pageNames[index] ?? `Page ${index + 1}`}${isActive ? ', current' : ''}`}
                title={pageNames[index]}
                onClick={() => onSelectPage(index)}
                className="group/dot relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#147FD4]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
              >
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-200 ${
                    isActive
                      ? 'h-2.5 w-2.5 scale-110 bg-[#147FD4]'
                      : 'h-2 w-2 bg-gray-300 dark:bg-gray-600 group-hover/dot:bg-[#147FD4]/70 group-hover/dot:dark:bg-[#147FD4]/55 group-hover/dot:shadow-[0_0_0_3px_rgba(20,127,212,0.22)]'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Next dashboard page"
          className={`${navButtonClass} ${!canGoNext ? 'invisible pointer-events-none' : ''}`}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      <p className="max-w-[220px] truncate text-xs text-gray-500 dark:text-gray-400">
        {activeName}
      </p>
    </div>
  );
};
