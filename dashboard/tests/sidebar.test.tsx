import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Sidebar } from '../src/components/Sidebar';
import type { User, PageType } from '../src/types';

const user: User = { id: 'u1', email: 'agent@hotel.com', name: 'Test Agent', role: 'agent' } as unknown as User;

afterEach(cleanup);

describe('Sidebar', () => {
  it('renders all four nav items', () => {
    render(<Sidebar page="templates" onNavigate={() => undefined} user={user} onLogout={() => undefined} />);
    for (const label of ['Templates', 'Properties', 'Shift Notes', 'Audit Logs']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('calls onNavigate with the clicked page id', () => {
    const onNavigate = vi.fn();
    render(<Sidebar page="templates" onNavigate={onNavigate as (p: PageType) => void} user={user} onLogout={() => undefined} />);
    fireEvent.click(screen.getByText('Properties'));
    expect(onNavigate).toHaveBeenCalledWith('properties');
  });

  it('shows the user name and falls back to email', () => {
    render(<Sidebar page="templates" onNavigate={() => undefined} user={user} onLogout={() => undefined} />);
    expect(screen.getByText('Test Agent')).toBeTruthy();

    const emailOnly = { ...user, name: null } as unknown as User;
    cleanup();
    render(<Sidebar page="templates" onNavigate={() => undefined} user={emailOnly} onLogout={() => undefined} />);
    expect(screen.getByText('agent@hotel.com')).toBeTruthy();
  });

  it('calls onLogout when the logout button is clicked', () => {
    const onLogout = vi.fn();
    render(<Sidebar page="templates" onNavigate={() => undefined} user={user} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalled();
  });
});
