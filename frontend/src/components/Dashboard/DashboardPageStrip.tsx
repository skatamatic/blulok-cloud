import React from 'react';
import { motion } from 'framer-motion';

export interface DashboardPageStripProps {
  pageCount: number;
  activeIndex: number;
  children: React.ReactNode;
}

/**
 * Keeps every dashboard page mounted in a horizontal track and slides the viewport
 * over them (no AnimatePresence remount / fade).
 */
export const DashboardPageStrip: React.FC<DashboardPageStripProps> = ({
  pageCount,
  activeIndex,
  children,
}) => {
  const safeCount = Math.max(pageCount, 1);
  const slidePercent = safeCount > 1 ? (100 / safeCount) * activeIndex : 0;

  return (
    <motion.div className="relative h-full min-h-0 w-full overflow-hidden" initial={false}>
      <motion.div
        className="flex h-full min-h-0"
        style={{ width: `${safeCount * 100}%` }}
        initial={false}
        animate={{ x: `-${slidePercent}%` }}
        transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export interface DashboardPageStripPanelProps {
  pageCount: number;
  pageIndex: number;
  isActive: boolean;
  children: React.ReactNode;
}

export const DashboardPageStripPanel: React.FC<DashboardPageStripPanelProps> = ({
  pageCount,
  pageIndex,
  isActive,
  children,
}) => {
  const safeCount = Math.max(pageCount, 1);
  const panelWidth = `${100 / safeCount}%`;

  return (
    <motion.div
      className={`flex h-full min-h-0 flex-shrink-0 flex-col${isActive ? '' : ' pointer-events-none'}`}
      style={{ width: panelWidth }}
      aria-hidden={!isActive}
      data-dashboard-page-index={pageIndex}
      data-active={isActive ? 'true' : 'false'}
    >
      {children}
    </motion.div>
  );
};
