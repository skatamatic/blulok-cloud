import { ArrowPathIcon, CheckCircleIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { useState, useEffect } from 'react';

export function FMSSyncStatusBar() {
  const { syncState, maximizeSync, showReview } = useFMSSync();
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Animate progress changes smoothly over 0.5 seconds
  useEffect(() => {
    const targetProgress = syncState.progressPercentage;
    const startProgress = animatedProgress;
    const duration = 500; // 0.5 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(startProgress + (targetProgress - startProgress) * (elapsed / duration), targetProgress);

      setAnimatedProgress(progress);

      if (progress < targetProgress) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [syncState.progressPercentage]);

  // Show status bar when:
  // 1. Sync is active and minimized and not showing review modal (during progress)
  // 2. OR when showReviewModal is true and minimized (for review changes)
  if (!syncState.isActive || !syncState.isMinimized) {
    return null;
  }

  const getStepIcon = () => {
    if (syncState.showReviewModal || syncState.currentStep === 'complete') {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    }
    if (syncState.currentStep === 'cancelled') {
      return <XMarkIcon className="h-5 w-5 text-red-500" />;
    }
    return <ArrowPathIcon className="h-5 w-5 text-primary-500 animate-spin" />;
  };

  const getStepText = () => {
    if (syncState.showReviewModal) {
      return `Review ${(syncState.pendingChanges || []).length} changes${syncState.facilityName ? ` - ${syncState.facilityName}` : ''}`;
    }
    if (syncState.currentStep === 'cancelled') {
      return `Sync cancelled${syncState.facilityName ? ` - ${syncState.facilityName}` : ''}`;
    }
    return `Syncing ${syncState.facilityName || ''}...`;
  };

  const getProgressText = () => {
    if (syncState.showReviewModal) {
      return `${(syncState.pendingChanges || []).length} changes detected`;
    }
    if (syncState.currentStep === 'cancelled') {
      return 'Cancelled';
    }
    return `${syncState.progressPercentage}% complete`;
  };

  const handleClick = () => {
    // If showing review modal, open the review modal
    if (syncState.showReviewModal) {
      showReview();
    } else {
      // Otherwise, maximize the sync progress modal
      maximizeSync();
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000]">
      <div
        className={`flex items-center space-x-3 px-4 py-3 rounded-lg shadow-lg border-2 transition-all duration-300 cursor-pointer ${
          syncState.showReviewModal || syncState.currentStep === 'complete'
            ? 'bg-green-100 dark:bg-green-900/50 border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/70 animate-pulse-glow'
            : syncState.currentStep === 'cancelled'
            ? 'bg-red-100 dark:bg-red-900/50 border-red-300 dark:border-red-700'
            : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 hover:shadow-xl'
        }`}
        onClick={handleClick}
      >

        {/* Icon */}
        {getStepIcon()}

        {/* Content */}
        <div className="flex-1 min-w-0 pr-16"> {/* Add padding-right to avoid overlap with buttons */}
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
              {getStepText()}
            </div>
            {syncState.currentStep === 'complete' && (
              <EyeIcon className="h-4 w-4 text-primary-500 ml-2 flex-shrink-0" />
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {getProgressText()}
          </div>
        </div>

        {/* Progress Bar (only for active sync, not review) */}
        {!syncState.showReviewModal && syncState.currentStep !== 'complete' && syncState.currentStep !== 'cancelled' && (
          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full"
              style={{ width: `${animatedProgress}%` }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
