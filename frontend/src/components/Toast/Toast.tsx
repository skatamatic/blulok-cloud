import React, { useEffect, useState } from 'react';
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { Toast as ToastType } from '@/types/toast.types';

interface ToastProps {
  toast: ToastType;
  onRemove: (id: string) => void;
  index: number;
}

const Toast: React.FC<ToastProps> = ({ toast, onRemove, index }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (toast.duration && toast.duration > 0 && !toast.persistent) {
      const timer = setTimeout(() => {
        handleRemove();
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.persistent]);

  const handleRemove = () => {
    setIsRemoving(true);
    setTimeout(() => {
      onRemove(toast.id);
    }, 300); // Match animation duration
  };

  const getToastConfig = () => {
    switch (toast.type) {
      case 'success':
        return {
          icon: CheckCircleIcon,
          bgColor: 'bg-green-50 dark:bg-green-900/80',
          borderColor: 'border-green-200 dark:border-green-700',
          textColor: 'text-green-800 dark:text-green-100',
          iconColor: 'text-green-500 dark:text-green-400',
        };
      case 'info':
        return {
          icon: InformationCircleIcon,
          bgColor: 'bg-blue-50 dark:bg-blue-900/80',
          borderColor: 'border-blue-200 dark:border-blue-700',
          textColor: 'text-blue-800 dark:text-blue-100',
          iconColor: 'text-blue-500 dark:text-blue-400',
        };
      case 'warning':
        return {
          icon: ExclamationTriangleIcon,
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/80',
          borderColor: 'border-yellow-200 dark:border-yellow-700',
          textColor: 'text-yellow-800 dark:text-yellow-100',
          iconColor: 'text-yellow-500 dark:text-yellow-400',
        };
      case 'error':
        return {
          icon: ExclamationCircleIcon,
          bgColor: 'bg-red-50 dark:bg-red-900/80',
          borderColor: 'border-red-200 dark:border-red-700',
          textColor: 'text-red-800 dark:text-red-100',
          iconColor: 'text-red-500 dark:text-red-400',
        };
      case 'critical':
        return {
          icon: ExclamationCircleIcon,
          bgColor: 'bg-red-100 dark:bg-red-900/90',
          borderColor: 'border-red-300 dark:border-red-600',
          textColor: 'text-red-900 dark:text-red-100',
          iconColor: 'text-red-600 dark:text-red-400',
        };
      default:
        return {
          icon: InformationCircleIcon,
          bgColor: 'bg-gray-50 dark:bg-gray-900/80',
          borderColor: 'border-gray-200 dark:border-gray-700',
          textColor: 'text-gray-800 dark:text-gray-100',
          iconColor: 'text-gray-500 dark:text-gray-400',
        };
    }
  };

  const config = getToastConfig();
  const Icon = config.icon;

  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out
        ${isVisible && !isRemoving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${isRemoving ? 'translate-x-full opacity-0 scale-95' : ''}
        w-80 max-w-sm
      `}
      style={{
        transform: `translateY(${index * -8}px)`,
        zIndex: 1000 - index,
      }}
    >
      <div
        className={`
          relative p-4 rounded-lg border shadow-lg
          ${config.bgColor} ${config.borderColor}
          backdrop-blur-sm
        `}
      >
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon className={`h-5 w-5 ${config.iconColor}`} />
          </div>
          <div className="ml-3 flex-1">
            <h3 className={`text-sm font-medium ${config.textColor}`}>
              {toast.title}
            </h3>
            {toast.message && (
              <p className={`mt-1 text-sm ${config.textColor} opacity-90`}>
                {toast.message}
              </p>
            )}
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={handleRemove}
              className={`
                inline-flex rounded-md p-1.5 transition-colors duration-200
                ${config.textColor} hover:bg-black/5 dark:hover:bg-white/5
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
              `}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Progress bar for non-persistent toasts */}
        {!toast.persistent && toast.duration && toast.duration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10 rounded-b-lg overflow-hidden">
            <div
              className="h-full bg-current opacity-30 animate-pulse"
              style={{
                animation: `toast-progress ${toast.duration}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Toast;
