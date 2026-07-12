'use client';

/**
 * Toast notification container
 * Displays success, error, warning, and info messages
 */

import React from 'react';
import { Toast, registerToastHandler } from '@/lib/error-handler';
import { theme } from './ui';

const TOAST_Z_INDEX = 350;

type ToastStyle = { bg: string; border: string; text: string };

const toastStyles: Record<Toast['type'], ToastStyle> = {
  success: {
    bg: theme.colors.successMuted,
    border: theme.colors.success,
    text: theme.colors.textPrimary,
  },
  error: {
    bg: theme.colors.errorMuted,
    border: theme.colors.error,
    text: theme.colors.textPrimary,
  },
  warning: {
    bg: theme.colors.warningMuted,
    border: theme.colors.warning,
    text: theme.colors.textPrimary,
  },
  info: {
    bg: theme.colors.infoMuted,
    border: theme.colors.info,
    text: theme.colors.textPrimary,
  },
};

function getIcon(type: Toast['type']) {
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
}

export const ToastContainer = () => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  React.useEffect(() => {
    registerToastHandler({
      show: (toast: Toast) => {
        setToasts((prev) => [...prev, toast]);

        if (toast.duration && toast.duration > 0) {
          setTimeout(() => {
            removeToast(toast.id);
          }, toast.duration);
        }
      },
    });
  }, [removeToast]);

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        insetInlineEnd: 16,
        bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))',
        zIndex: TOAST_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 384,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const style = toastStyles[toast.type] || toastStyles.info;
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              borderRadius: theme.radius.md,
              border: `1px solid ${style.border}`,
              background: style.bg,
              color: style.text,
              boxShadow: theme.shadows.md,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 18, flexShrink: 0, color: style.border }}>
              {getIcon(toast.type)}
            </span>
            <p style={{ flex: 1, margin: 0, fontSize: 14, lineHeight: 1.4 }}>{toast.message}</p>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="סגירה"
              style={{
                fontSize: 20,
                lineHeight: 1,
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: style.text,
                cursor: 'pointer',
                padding: 4,
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
