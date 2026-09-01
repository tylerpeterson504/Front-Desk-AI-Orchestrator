import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';
import { shiftNotesAPI, propertiesAPI } from '../services/api';
import { Plus, Trash2 } from '../components/icons';

export const ShiftNotesPage = ({ embedded = false }) => {
  const [notes, setNotes] = React.useState([]);
  const [properties, setProperties] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [newNote, setNewNote] = React.useState('');
  const [selectedProperty, setSelectedProperty] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    try {
      setLoading(true);
      const [notesRes, propsRes] = await Promise.all([
        shiftNotesAPI.getToday(),
        propertiesAPI.getAll()
      ]);
      setNotes(notesRes.data);
      setProperties(propsRes.data);
      // Default to the first property, but never clobber a choice the user has
      // already made — reading it from state here would also make this callback
      // change identity on every selection.
      if (propsRes.data.length) {
        setSelectedProperty((current) => current || String(propsRes.data[0].id));
      }
      setError('');
    } catch (err) {
      setError('Failed to load shift notes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedProperty) return;
    try {
      setSubmitting(true);
      await shiftNotesAPI.create({
        property_id: Number(selectedProperty),
        content: newNote.trim()
      });
      setNewNote('');
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to add shift note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await shiftNotesAPI.delete(id);
      await loadAll();
    } catch (err) {
      setError('Failed to delete shift note');
    }
  };

  const propertyName = (id) =>
    properties.find((p) => p.id === id)?.name || `Property #${id}`;

  if (loading) return <LoadingSpinner />;

  return (
    <div className={embedded ? '' : 'flex h-screen'}>
      {!embedded && <Sidebar />}
      <div className={embedded ? '' : 'flex-1 bg-gray-50 overflow-auto'}>
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Shift Notes</h1>
          <p className="text-gray-500 mb-8">Notes for today — shared with the extension sidepanel.</p>

          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Property</label>
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                >
                  {properties.length === 0 && <option value="">No properties — add one first</option>}
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Note</label>
                <input
                  type="text"
                  placeholder="e.g. Elevator maintenance 2–4 PM"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting || properties.length === 0}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} />
              <span>Add Note</span>
            </button>
          </form>

          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                <div>
                  <p className="text-gray-800">{note.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {propertyName(note.property_id)} ·{' '}
                    {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(note.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {!loading && notes.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No shift notes for today yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
