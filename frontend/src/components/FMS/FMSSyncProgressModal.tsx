/**
 * FMS Sync Progress Modal
 * 
 * Shows progress while syncing with FMS
 */

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface FMSSyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SyncStep = 'connecting' | 'fetching' | 'detecting' | 'preparing' | 'complete';

export function FMSSyncProgressModal({ isOpen, onClose }: FMSSyncProgressModalProps) {
  const [currentStep, setCurrentStep] = useState<SyncStep>('connecting');

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('connecting');
      return;
    }

    // Simulate progress through the steps based on our backend timing
    // Step 1: Connecting (2 seconds)
    const timer1 = setTimeout(() => setCurrentStep('fetching'), 2000);
    
    // Step 2: Fetching (4 seconds - 2s for tenants + 2s for units)
    const timer2 = setTimeout(() => setCurrentStep('detecting'), 6000);
    
    // Step 3: Detecting (2 seconds)
    const timer3 = setTimeout(() => setCurrentStep('preparing'), 8000);
    
    // Step 4: Preparing (2 seconds)
    const timer4 = setTimeout(() => setCurrentStep('complete'), 10000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [isOpen]);

  const getStepStatus = (step: SyncStep) => {
    const steps: SyncStep[] = ['connecting', 'fetching', 'detecting', 'preparing', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const getProgressPercentage = () => {
    const steps: SyncStep[] = ['connecting', 'fetching', 'detecting', 'preparing', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    return ((currentIndex + 1) / steps.length) * 100;
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
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 p-6 shadow-2xl transition-all">
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/20 dark:to-primary-800/20 border-2 border-primary-200 dark:border-primary-800">
                    <ArrowPathIcon className="h-8 w-8 text-primary-600 dark:text-primary-400 animate-spin" />
                  </div>
                  
                  <Dialog.Title
                    as="h3"
                    className="mt-4 text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Syncing with FMS
                  </Dialog.Title>

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
                        className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-1000 ease-out"
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
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
