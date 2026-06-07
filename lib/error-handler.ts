/**
 * Centralized error handling and user feedback
 * Provides consistent toast/notification pattern
 */

import { formatApiErrorBody } from '@/lib/format-zod-error'

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // milliseconds, 0 = persistent
}

// Global toast handlers (will be set by UI layer)
let toastHandlers: {
  show: (toast: Toast) => void;
} | null = null;

/**
 * Register toast handler from UI component
 * Should be called once in root layout or app component
 */
export function registerToastHandler(handler: { show: (toast: Toast) => void }) {
  toastHandlers = handler;
}

/**
 * Show toast notification
 */
export function showToast(type: ToastType, message: string, duration: number = 4000) {
  if (!toastHandlers) {
    // Fallback if not registered (dev mode)
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  const id = `toast-${Date.now()}-${Math.random()}`;
  toastHandlers.show({
    id,
    type,
    message,
    duration: duration === 0 ? 0 : Math.max(duration, 2000),
  });
}

export const toast = {
  success: (message: string, duration?: number) => showToast('success', message, duration),
  error: (message: string, duration?: number) => showToast('error', message, duration || 5000),
  warning: (message: string, duration?: number) => showToast('warning', message, duration),
  info: (message: string, duration?: number) => showToast('info', message, duration),
};

/**
 * Extract user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message && error.message !== '[object Object]') return error.message
  }

  if (typeof error === 'object' && error !== null) {
    // Supabase error format
    if ('message' in error) {
      return (error as { message: string }).message;
    }
    // Fetch error response format
    if ('error' in error) {
      const err = (error as { error: unknown }).error;
      if (typeof err === 'string') return err;
      if (typeof err === 'object' && err !== null && 'message' in err) {
        return (err as { message: string }).message;
      }
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error && error.message === '[object Object]') {
    return 'שגיאה בשמירה — בדקו את השדות'
  }

  return 'שגיאה לא צפויה — נסה שוב';
}

/** Parse JSON error field from API responses (string or Zod flatten object). */
export function errorMessageFromResponseJson(json: { error?: unknown } | null | undefined, fallback: string): string {
  if (!json?.error) return fallback
  if (typeof json.error === 'string') return json.error
  if (typeof json.error === 'object' && json.error !== null) {
    return formatApiErrorBody(json.error)
  }
  return fallback
}

/**
 * Safe async wrapper with automatic error toast
 * Usage: await asyncHandler(() => myAsyncFunction())
 */
export async function asyncHandler<T>(
  fn: () => Promise<T>,
  options: {
    onError?: (error: string) => void;
    showErrorToast?: boolean;
    context?: string; // For logging
  } = {}
): Promise<T | null> {
  const { onError, showErrorToast = true, context = 'Operation' } = options;

  try {
    return await fn();
  } catch (error) {
    const message = getErrorMessage(error);
    const errorMsg = `${context}: ${message}`;

    console.error(errorMsg, error);

    if (showErrorToast) {
      toast.error(message)
    }

    if (onError) {
      onError(message);
    }

    return null;
  }
}

/**
 * Validate response status and throw on error
 */
export async function validateResponse(response: Response, context: string = 'Request') {
  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    let errorMessage = `${context} failed with status ${response.status}`;

    try {
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        if (data.error) {
          errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        } else if (data.message) {
          errorMessage = data.message;
        }
      } else {
        const text = await response.text();
        if (text) errorMessage = text;
      }
    } catch {
      // Ignore parsing errors, use default message
    }

    throw new Error(errorMessage);
  }
}
