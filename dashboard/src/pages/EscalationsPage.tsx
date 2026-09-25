import React from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';
import { escalationAPI, propertyAPI, userAPI } from '../services/api';
import { Escalation, Property, User } from '../types';

interface EscalationsPageProps {
  embedded?: boolean;
}

const STATUS_FILTERS = ['all', 'open', 'assigned', 'resolved'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700'
};

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800'
};

export const EscalationsPage: React.FC<EscalationsPageProps> = ({ embedded = false }) => {
  const [escalations, setEscalations] = React.useState<Escalation[]>([]);
  const [properties, setProperties] = React.useState<Property[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<(typeof STATUS_FILTERS)[number]>('all');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // Create form
  const [propertyId, setPropertyId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [priority, setPriority] = React.useState<Escalation['priority']>('normal');
  const [guestName, setGuestName] = React.useState('');
  const [roomNumber, setRoomNumber] = React.useState('');
  const [assignTo, setAssignTo] = React.useState('');

  const loadAll = React.useCallback(async () => {
    try {
      setLoading(true);
      const [escRes, propsRes, usersRes] = await Promise.all([
        escalationAPI.getAll(statusFilter === 'all' ? undefined : statusFilter),
        propertyAPI.getAll(),
        userAPI.list().catch(() => [] as User[])
      ]);
      setEscalations(escRes);
      setProperties(propsRes);
      setUsers(usersRes);
      const first = propsRes[0];
      if (first) setPropertyId((current) => current || String(first.id));
      setError('');
    } catch (err) {
      setError('Failed to load escalations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !propertyId) return;
    try {
      setSubmitting(true);
      await escalationAPI.create({
        property_id: Number(propertyId),
        reason: reason.trim(),
        priority,
        guest_name: guestName.trim() || undefined,
        room_number: roomNumber.trim() || undefined
      });
      setReason('');
      setGuestName('');
      setRoomNumber('');
      flash('Escalation created');
      await loadAll();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Failed to create escalation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: number, patch: Partial<Escalation>) => {
    try {
      await escalationAPI.update(id, patch);
      flash('Escalation updated');
      await loadAll();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Failed to update escalation');
    }
  };

  const handleAssign = async (esc: Escalation) => {
    if (!assignTo) return;
    await handleUpdate(esc.id, { assigned_to: assignTo } as Partial<Escalation>);
    setAssignTo('');
  };

  const handleDelete = async (id: number) => {
    try {
      await escalationAPI.delete(id);
      flash('Escalation deleted');
      await loadAll();
    } catch (err) {
      setError('Failed to delete escalation');
    }
  };

  const propertyName = (id: number): string =>
    properties.find((p) => p.id === id)?.name || 'Property #' + id;

  const userName = (id: string | null): string => {
    if (!id) return '';
    const user = users.find((u) => u.id === id);
    return user?.name || user?.email || id.slice(0, 8);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className={embedded ? '' : 'flex h-screen'}>
      <div className={embedded ? '' : 'flex-1 bg-gray-50 overflow-auto'}>
        <div className="p-8">
          <h1 className="text-3xm font-bold text-gray-800 mb-2">Escalations</h1>
          <p className="text-gray-500 mb-6">
            Flag guest issues that need follow-up, assign them to another agent, and track them to resolution.
          </p>

          {error && <Alert type="error" message={error} onClose={() => setError('')} />}
          {success && <Alert type="success" message={success} />}

          <div className="flex space-x-2 mb-6">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={statusFilter === s
                  ? 'px-4 py-2 rounded-lg bg-blue-600 text-white capitalize'
                  : 'px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 capitalize hover:bg-gray-50'}
              >
                {s}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow mb-8 space-y-4">
            <h2 className="font-semibold text-gray-700">New escalation</h2>
            <div className="grid grid-cols-6 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Property</label>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                >
                  {properties.length === 0 && <option value="">No properties</option>}
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Reason</label>
                <input
                  type="text"
                  placeholder="e.g. AC not working in suite 402"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Guest</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Room</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Escalation['priority'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create escalation'}
            </button>
          </form>

          {escalations.length === 0 ? (
            <p className="text-gray-500">No escalations {statusFilter !== 'all' ? 'with status "' + statusFilter + '"' : ''}.</p>
          ) : (
            <ul className="space-y-3">
              {escalations.map((esc) => (
                <li key={esc.id} className="bg-white p-5 rounded-lg shadow flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_BADGE[esc.status] || '')}>{esc.status}</span>
                      <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + (PRIORITY_BADGE[esc.priority] || '')}>{esc.priority}</span>
                      <span className="text-xs text-gray-400">{propertyName(esc.property_id)}</span>
                    </div>
                    <p className="text-gray-800 break-words">{esc.reason}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {esc.guest_name ? esc.guest_name + (esc.room_number ? ' · Room ' + esc.room_number : '') : esc.room_number ? 'Room ' + esc.room_number : ''}
                      {esc.assigned_to ? ' · assigned to ' + userName(esc.assigned_to) : ''}
                      {' · ' + new Date(esc.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {esc.status !== 'resolved' ? (
                      <button
                        onClick={() => handleUpdate(esc.id, { status: 'resolved' } as Partial<Escalation>)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Resolve
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdate(esc.id, { status: 'open' } as Partial<Escalation>)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                      >
                        Reopen
                      </button>
                    )}
                    {esc.status !== 'resolved' && (
                      <div className="flex gap-1">
                        <select
                           aria-label={'Assign escalation ' + esc.id}
                          value={assignTo}
                           onChange={(e) => setAssignTo(e.target.value)}
                           className="w-36 px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                        >
                          <option value="">Assign to…</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name || u.email}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(esc)}
                          disabled={!assignTo}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => handleDelete(esc.id)}
                      className="px-3 py-1.5 bg-red-50 text-red-700 rounded text-sm hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default EscalationsPage;
