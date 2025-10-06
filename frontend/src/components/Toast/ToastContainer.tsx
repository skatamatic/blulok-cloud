import React from 'react';
import Toast from './Toast';
import { useToast } from '@/contexts/ToastContext';

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          toast={toast}
          onRemove={removeToast}
          index={index}
        />
      ))}
    </div>
  );
};

export default ToastContainer;


