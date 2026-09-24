import { useCallback } from 'react';
import { useToasts } from '../components/Toast';

// Single mapping from API error payloads to user-facing messages. The backend
// returns { error, code, requestId }; the UI shows the server message when
// present and falls back to a plain-language default per status.
const STATUS_DEFAULTS: Record<number, string> = {
  400: 'That request was invalid. Please check the fields and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'That item could not be found.',
  409: 'This conflicts with an existing record.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.'
};

export interface ApiErrorShape {
  error?: string;
  code?: string;
  requestId?: string;
}

export function toUserMessage(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const data = (err as { response?: { data?: ApiErrorShape } })?.response?.data;

  if (data?.error) {
    return data.error;
  }
  if (status && STATUS_DEFAULTS[status]) {
    return STATUS_DEFAULTS[status];
  }
  return STATUS_DEFAULTS[500];
}

// Convenience hook: surface any API error as a toast, optionally prefixed
// with the action that failed ("Save template: ...").
export function useApiErrorToast() {
  const { pushToast } = useToasts();
  return useCallback(
    (err: unknown, context?: string) => {
      const message = toUserMessage(err);
      pushToast(context ? `${context}: ${message}` : message, 'error');
    },
    [pushToast]
  );
}
