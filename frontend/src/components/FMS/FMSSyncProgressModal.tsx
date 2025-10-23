/**
 * FMS Sync Progress Modal
 * 
 * Shows progress while syncing with FMS
 */

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ArrowPathIcon, CheckCircleIcon, MinusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useFMSSync, SyncStep } from '@/contexts/FMSSyncContext';
import { fmsService } from '@/services/fms.service';

interface FMSSyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilityId?: string;
  facilityName?: string;
}

export function FMSSyncProgressModal({ isOpen, onClose, facilityId }: FMSSyncProgressModalProps) {
  const { syncState, minimizeSync, cancelSync } = useFMSSync();
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

  const getStepStatus = (step: SyncStep) => {
    const steps: SyncStep[] = ['connecting', 'fetching', 'detecting', 'preparing', 'complete'];
    const currentIndex = steps.indexOf(syncState.currentStep);
    const stepIndex = steps.indexOf(step);

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const getProgressPercentage = () => {
    return animatedProgress;
  };

  const renderStepIcon = (step: SyncStep) => {
    const status = getStepStatus(step);
    
    if (status === 'complete') {
      return <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />;
    }
    
    if (status === 'active') {
      return <ArrowPathIcon className="h-5 w-5 text-primary-500 mr-3 flex-shrink-0 animate-spin" />;
    }
    
    return <div className="h-5 w-5 mr-3 flex-shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />;
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 p-6 shadow-2xl transition-all relative">
                {/* Window Controls - Top Right */}
                <div className="absolute top-4 right-4 flex items-center space-x-1">
                  {syncState.currentStep !== 'complete' && (
                    <>
                      <button
                        onClick={minimizeSync}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Minimize to status bar"
                      >
                        <MinusIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            // Call backend cancel endpoint
                            if (facilityId) {
                              await fmsService.cancelSync(facilityId);
                            }
                          } catch (error) {
                            console.error('Failed to cancel sync:', error);
                          }

                          // Update local state
                          cancelSync();
                          onClose();
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Cancel sync"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {syncState.currentStep === 'complete' && (
                    <button
                      onClick={onClose}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Close"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Show "All Up to Date" view when complete with no changes */}
                {syncState.currentStep === 'complete' && syncState.pendingChanges.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/20 dark:to-green-800/20 border-2 border-green-200 dark:border-green-800">
                      <CheckCircleIcon className="h-12 w-12 text-green-600 dark:text-green-400" />
                    </div>

                    <div className="mt-6">
                      <Dialog.Title
                        as="h3"
                        className="text-2xl font-bold text-gray-900 dark:text-white"
                      >
                        All Up to Date!
                      </Dialog.Title>
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        Your facility data is in perfect sync with the FMS.
                      </p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        No changes were detected during this sync.
                      </p>
                    </div>

                    <button
                      onClick={onClose}
                      className="mt-8 w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-sm"
                    >
                      Got it
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/20 dark:to-primary-800/20 border-2 border-primary-200 dark:border-primary-800">
                    <ArrowPathIcon className="h-8 w-8 text-primary-600 dark:text-primary-400 animate-spin" />
                  </div>

                  <div className="mt-4">
                    <Dialog.Title
                      as="h3"
                      className="text-xl font-semibold text-gray-900 dark:text-white"
                    >
                      Syncing with FMS{syncState.facilityName ? ` - ${syncState.facilityName}` : ''}
                    </Dialog.Title>
                  </div>

                  <div className="mt-8 space-y-4">
                    {/* Progress Steps */}
                    <div className={`flex items-center text-left transition-all duration-300 ${
                      getStepStatus('connecting') === 'pending' ? 'opacity-40' : 'opacity-100'
                    }`}>
                      {renderStepIcon('connecting')}
                      <span className={`text-sm font-medium ${
                        getStepStatus('connecting') === 'active' 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : getStepStatus('connecting') === 'complete'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        Connecting to FMS Provider
                      </span>
                    </div>

                    <div className={`flex items-center text-left transition-all duration-300 ${
                      getStepStatus('fetching') === 'pending' ? 'opacity-40' : 'opacity-100'
                    }`}>
                      {renderStepIcon('fetching')}
                      <span className={`text-sm font-medium ${
                        getStepStatus('fetching') === 'active' 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : getStepStatus('fetching') === 'complete'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        Fetching Tenants and Units
                      </span>
                    </div>

                    <div className={`flex items-center text-left transition-all duration-300 ${
                      getStepStatus('detecting') === 'pending' ? 'opacity-40' : 'opacity-100'
                    }`}>
                      {renderStepIcon('detecting')}
                      <span className={`text-sm font-medium ${
                        getStepStatus('detecting') === 'active' 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : getStepStatus('detecting') === 'complete'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        Detecting Changes
                      </span>
                    </div>

                    <div className={`flex items-center text-left transition-all duration-300 ${
                      getStepStatus('preparing') === 'pending' ? 'opacity-40' : 'opacity-100'
                    }`}>
                      {renderStepIcon('preparing')}
                      <span className={`text-sm font-medium ${
                        getStepStatus('preparing') === 'active' 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : getStepStatus('preparing') === 'complete'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        Preparing Results
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-8">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                        style={{ width: `${getProgressPercentage()}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                      {Math.round(getProgressPercentage())}% complete
                    </p>
                  </div>

                  <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
                    This may take a few moments...
                  </p>
                </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
