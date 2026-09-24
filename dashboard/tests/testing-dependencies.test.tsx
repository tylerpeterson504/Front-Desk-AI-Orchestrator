import { fireEvent, within } from '@testing-library/dom';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dashboardPackage from '../package.json';
import { Sidebar } from '../src/components/Sidebar';

afterEach(cleanup);

describe('dashboard testing dependencies', () => {
  it.each(['@testing-library/react', '@testing-library/dom', 'jsdom'])(
    'declares %s directly for clean test installs',
    (dependency) => {
      expect(dashboardPackage.devDependencies[dependency]).toMatch(/^\^?\d+\.\d+\.\d+/);
    }
  );

  it('renders a dashboard component and dispatches events through the DOM peer', () => {
    const onNavigate = vi.fn();
    const { container } = render(<Sidebar onNavigate={onNavigate} />);

    fireEvent.click(within(container).getByRole('button', { name: 'Properties' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('properties');
  });

  it('removes unmounted components from jsdom queries', () => {
    const { unmount } = render(<Sidebar />);

    expect(within(document.body).queryByRole('button', { name: 'Logout' })).not.toBeNull();
    unmount();
    expect(within(document.body).queryByRole('button', { name: 'Logout' })).toBeNull();
  });
});
