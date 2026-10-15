import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EscalationsPage } from '../src/pages/EscalationsPage';
import { PropertiesPage } from '../src/pages/PropertiesPage';
import { ShiftNotesPage } from '../src/pages/ShiftNotesPage';
import { TemplatesPage } from '../src/pages/TemplatesPage';
import {
  escalationAPI,
  propertyAPI,
  shiftNoteAPI,
  templateAPI,
  userAPI,
} from '../src/services/api';
import type { Escalation, Property } from '../src/types';

const property: Property = {
  id: 1,
  name: 'Harbor Inn',
  wifi_password: 'fallback-secret',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function apiError(status: number, data: unknown) {
  return Object.assign(new Error('Request failed with status code ' + status), {
    response: { status, data },
  });
}

function escalation(overrides: Partial<Escalation>): Escalation {
  return {
    id: 1,
    property_id: 1,
    created_by: 'u1',
    guest_name: null,
    room_number: null,
    reason: 'AC not working',
    priority: 'normal',
    status: 'open',
    assigned_to: null,
    resolved_at: null,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PropertiesPage WiFi reveal', () => {
  it('keeps the password hidden and shows the error when the reveal fails', async () => {
    vi.spyOn(propertyAPI, 'getAll').mockResolvedValue([property]);
    vi.spyOn(propertyAPI, 'getWifi').mockRejectedValue(
      apiError(403, { error: 'WiFi access is restricted' })
    );
    render(<PropertiesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));

    expect(await screen.findByText('WiFi access is restricted')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeTruthy();
    expect(screen.queryByText('fallback-secret')).toBeNull();
  });
});

describe('EscalationsPage list responses', () => {
  it('ignores a list response for a filter that is no longer selected', async () => {
    const pending = new Map<string, (rows: Escalation[]) => void>();
    vi.spyOn(escalationAPI, 'getAll').mockImplementation(
      (status?: string) =>
        new Promise<Escalation[]>((resolve) => pending.set(status ?? 'all', resolve))
    );
    vi.spyOn(propertyAPI, 'getAll').mockResolvedValue([property]);
    vi.spyOn(userAPI, 'list').mockResolvedValue([]);
    render(<EscalationsPage />);
    await waitFor(() => expect(pending.has('all')).toBe(true));
    await act(async () => pending.get('all')!([]));

    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await waitFor(() => expect(pending.has('open')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'resolved' }));
    await waitFor(() => expect(pending.has('resolved')).toBe(true));

    await act(async () =>
      pending.get('resolved')!([escalation({ status: 'resolved', reason: 'Minibar restock' })])
    );
    await act(async () => pending.get('open')!([escalation({ reason: 'Stale open entry' })]));

    expect(screen.getByText('Minibar restock')).toBeTruthy();
    expect(screen.queryByText('Stale open entry')).toBeNull();
  });
});

describe('server validation messages', () => {
  it('shows the server message when a template cannot be saved', async () => {
    vi.spyOn(templateAPI, 'getAll').mockResolvedValue([]);
    vi.spyOn(templateAPI, 'create').mockRejectedValue(
      apiError(400, { error: 'Template name must be unique' })
    );
    render(<TemplatesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add Template' }));
    fireEvent.change(screen.getByPlaceholderText('Template Name'), {
      target: { value: 'Greeting' },
    });
    fireEvent.change(screen.getByPlaceholderText('Template Content'), {
      target: { value: 'Hello there' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Template' }));

    expect(await screen.findByText('Template name must be unique')).toBeTruthy();
  });

  it('shows the server message when a shift note cannot be added', async () => {
    vi.spyOn(shiftNoteAPI, 'getAll').mockResolvedValue([]);
    vi.spyOn(propertyAPI, 'getAll').mockResolvedValue([property]);
    vi.spyOn(shiftNoteAPI, 'create').mockRejectedValue(
      apiError(400, { error: 'Note text is too long' })
    );
    render(<ShiftNotesPage />);

    fireEvent.change(await screen.findByPlaceholderText(/Elevator maintenance/), {
      target: { value: 'Pool closed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));

    expect(await screen.findByText('Note text is too long')).toBeTruthy();
  });

  it('shows the server message when an escalation cannot be created', async () => {
    vi.spyOn(escalationAPI, 'getAll').mockResolvedValue([]);
    vi.spyOn(propertyAPI, 'getAll').mockResolvedValue([property]);
    vi.spyOn(userAPI, 'list').mockResolvedValue([]);
    vi.spyOn(escalationAPI, 'create').mockRejectedValue(
      apiError(400, { error: 'Room number is required for this property' })
    );
    render(<EscalationsPage />);

    fireEvent.change(await screen.findByPlaceholderText('e.g. AC not working in suite 402'), {
      target: { value: 'Broken lock' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create escalation' }));

    expect(await screen.findByText('Room number is required for this property')).toBeTruthy();
  });

  it('shows the server message when an escalation cannot be updated', async () => {
    vi.spyOn(escalationAPI, 'getAll').mockResolvedValue([escalation({ reason: 'Broken lock' })]);
    vi.spyOn(propertyAPI, 'getAll').mockResolvedValue([property]);
    vi.spyOn(userAPI, 'list').mockResolvedValue([]);
    vi.spyOn(escalationAPI, 'update').mockRejectedValue(
      apiError(409, { error: 'Escalation was already resolved' })
    );
    render(<EscalationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));

    expect(await screen.findByText('Escalation was already resolved')).toBeTruthy();
  });
});
