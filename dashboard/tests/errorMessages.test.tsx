import { act, renderHook, screen } from '@testing-library/react';
import { ToastProvider } from '../src/components/Toast';
import { toUserMessage, useApiErrorToast } from '../src/lib/errorMessages';

describe('toUserMessage', () => {
  it('prefers a server error over the HTTP status default', () => {
    expect(toUserMessage({ response: { status: 401, data: { error: 'Account is locked' } } }))
      .toBe('Account is locked');
    expect(toUserMessage({ response: { status: 418, data: { error: 'Try another method' } } }))
      .toBe('Try another method');
  });

  it.each([
    [400, 'That request was invalid. Please check the fields and try again.'],
    [401, 'Your session has expired. Please sign in again.'],
    [403, 'You do not have permission to perform this action.'],
    [404, 'That item could not be found.'],
    [409, 'This conflicts with an existing record.'],
    [429, 'Too many requests. Please wait a moment and try again.'],
    [500, 'Something went wrong on our side. Please try again.']
  ])('uses the plain-language default for HTTP %i', (status, message) => {
    expect(toUserMessage({ response: { status, data: { code: 'ERROR', requestId: 'req-1' } } }))
      .toBe(message);
  });

  it.each([
    [undefined, 'Something went wrong on our side. Please try again.'],
    [null, 'Something went wrong on our side. Please try again.'],
    [new Error('internal detail'), 'Something went wrong on our side. Please try again.'],
    [{ response: { status: 503 } }, 'Something went wrong on our side. Please try again.'],
    [{ response: { status: 400, data: { error: '' } } }, 'That request was invalid. Please check the fields and try again.']
  ])('uses a safe fallback for absent or unsupported error details: %s', (error, expected) => {
    expect(toUserMessage(error)).toBe(expected);
  });
});

describe('useApiErrorToast', () => {
  it('shows the server message as an error toast with optional action context', () => {
    const { result } = renderHook(() => useApiErrorToast(), { wrapper: ToastProvider });

    act(() => result.current({ response: { status: 403, data: { error: 'Read-only account' } } }, 'Save template'));

    expect(screen.getByText('Save template: Read-only account').parentElement?.className)
      .toContain('bg-red-600');
  });

  it('shows a fallback error without a context prefix', () => {
    const { result } = renderHook(() => useApiErrorToast(), { wrapper: ToastProvider });

    act(() => result.current(new Error('private exception')));

    expect(screen.getByText('Something went wrong on our side. Please try again.')).toBeTruthy();
  });
});
