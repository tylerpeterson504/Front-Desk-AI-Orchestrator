import { act, fireEvent, renderHook, screen, within } from '@testing-library/react';
import { ToastProvider, useToasts } from '../src/components';

describe('ToastProvider', () => {
  afterEach(() => vi.useRealTimers());

  it('requires a provider to access the toast context', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useToasts())).toThrow('useToasts must be used within a ToastProvider');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('announces stacked notifications and styles the default, success, and error types', () => {
    const { result } = renderHook(() => useToasts(), { wrapper: ToastProvider });

    act(() => {
      result.current.pushToast('Informational');
      result.current.pushToast('Saved', 'success');
      result.current.pushToast('Failed', 'error');
    });

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(within(status).getAllByRole('button', { name: 'Dismiss notification' })).toHaveLength(3);
    expect(screen.getByText('Informational').parentElement?.className).toContain('bg-blue-600');
    expect(screen.getByText('Saved').parentElement?.className).toContain('bg-green-600');
    expect(screen.getByText('Failed').parentElement?.className).toContain('bg-red-600');
    expect(result.current.toasts.map(({ message }) => message)).toEqual(['Informational', 'Saved', 'Failed']);
  });

  it('dismisses only the selected toast without removing the others', () => {
    const { result } = renderHook(() => useToasts(), { wrapper: ToastProvider });
    act(() => {
      result.current.pushToast('First');
      result.current.pushToast('Second');
    });

    fireEvent.click(within(screen.getByText('First').parentElement!).getByRole('button'));

    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeTruthy();
    expect(result.current.toasts).toHaveLength(1);
  });

  it('expires each toast five seconds after it was added, independently', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts(), { wrapper: ToastProvider });
    act(() => result.current.pushToast('Earlier'));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.pushToast('Later'));

    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText('Later')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Earlier')).toBeNull();
    expect(screen.getByText('Later')).toBeTruthy();

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toasts).toEqual([]);
    expect(screen.queryByText('Later')).toBeNull();
  });

  it('does not dismiss a newer toast when an already-dismissed toast expires', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts(), { wrapper: ToastProvider });
    act(() => result.current.pushToast('Dismissed'));
    fireEvent.click(within(screen.getByText('Dismissed').parentElement!).getByRole('button'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.pushToast('Still here'));

    act(() => vi.advanceTimersByTime(4000));

    expect(screen.getByText('Still here')).toBeTruthy();
    expect(result.current.toasts).toHaveLength(1);
  });
});
