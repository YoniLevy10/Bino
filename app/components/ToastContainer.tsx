'use client';

/**
 * Toast notification container
 * Displays success, error, warning, and info messages
 */

import React from 'react';
import { Toast, registerToastHandler } from '@/lib/error-handler';

export const ToastContainer = () => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Register handler on mount
  React.useEffect(() => {
    registerToastHandler({
      show: (toast: Toast) => {
        setToasts((prev) => [...prev, toast]);

        // Auto-remove after duration
        if (toast.duration && toast.duration > 0) {
          setTimeout(() => {
            removeToast(toast.id);
          }, toast.duration);
        }
      },
    });
  }, [removeToast]);

  const getBackgroundColor = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getTextColor = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-800';
      case 'error':
        return 'text-red-800';
      case 'warning':
        return 'text-yellow-800';
      case 'info':
      default:
        return 'text-blue-800';
    }
  };

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <div
      className="fixed end-4 z-[200] space-y-2 max-w-sm"
      style={{ bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))' }}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            border rounded-lg p-4 flex items-start gap-3
            animate-in fade-in slide-in-from-bottom-4 duration-300
            ${getBackgroundColor(toast.type)}
          `}
        >
          <span className={`font-bold text-lg shrink-0 ${getTextColor(toast.type)}`}>
            {getIcon(toast.type)}
          </span>
          <p className={`flex-1 text-sm ${getTextColor(toast.type)}`}>{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className={`text-xl leading-none shrink-0 ${getTextColor(toast.type)} hover:opacity-70`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
