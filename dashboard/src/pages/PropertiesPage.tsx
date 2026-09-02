import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';
import { propertyAPI } from '../services/api';
import { Plus, Edit2, Trash2, Eye, EyeOff } from '../components/icons';
import { Property } from '../types';

interface PropertiesPageProps {
  embedded?: boolean;
}

interface FormData {
  name: string;
  url_pattern: string;
  wifi_ssid: string;
  wifi_password: string;
  checkout_time: string;
  tone_guidelines: string;
}

export const PropertiesPage: React.FC<PropertiesPageProps> = ({ embedded = false }) => {
  const [properties, setProperties] = React.useState<Property[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  // property id -> revealed Wi-Fi password. Fetched on demand, never in the
  // list payload: the server strips wifi_password from /properties and only
  // returns it from the audit-logged /:id/wifi route.
  const [revealed, setRevealed] = React.useState<Record<number, string>>({});
  const [revealing, setRevealing] = React.useState<number | null>(null);
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    url_pattern: '',
    wifi_ssid: '',
    wifi_password: '',
    checkout_time: '11:00:00',
    tone_guidelines: ''
  });

  React.useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const response = await propertyAPI.getAll();
      setProperties(response);
      setError('');
    } catch (err) {
      setError('Failed to load properties');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url_pattern: '',
      wifi_ssid: '',
      wifi_password: '',
      checkout_time: '11:00:00',
      tone_guidelines: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (property: Property) => {
    setFormData({
      name: property.name || '',
      url_pattern: property.address || '',
      wifi_ssid: property.wifi_ssid || '',
      wifi_password: '', // never prefill; blank = keep existing
      checkout_time: (property.checkout_time || '11:00:00').slice(0, 5),
      tone_guidelines: property.tone_guidelines || ''
    });
    setEditingId(property.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      // On edit, empty wifi_password means "unchanged" (the API never returns it)
      if (editingId && !payload.wifi_password) delete payload.wifi_password;
      if (editingId) {
        await propertyAPI.update(editingId, payload);
      } else {
        await propertyAPI.create(payload);
      }
      resetForm();
      await loadProperties();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Failed to save property');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this property? Shift notes linked to it will also be deleted.')) {
      try {
        await propertyAPI.delete(id);
        await loadProperties();
      } catch (err) {
        setError('Failed to delete property');
      }
    }
  };

  const toggleWifi = async (id: number) => {
    if (revealed[id]) {
      const { [id]: _removed, ...rest } = revealed;
      setRevealed(rest);
      return;
    }
    try {
      setRevealing(id);
      const { password } = await propertyAPI.getWifi(id);
      setRevealed((prev) => ({ ...prev, [id]: password }));
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Failed to reveal WiFi password');
    } finally {
      setRevealing(null);
    }
  };

  if (loading && properties.length === 0) return <LoadingSpinner />;

  return (
    <div className={embedded ? '' : 'flex h-screen'}>
      {!embedded && <Sidebar />}
      <div className={embedded ? '' : 'flex-1 bg-gray-50 overflow-auto'}>
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Properties</h1>
            <button
              onClick={() => (showForm ? resetForm() : setShowForm(true))}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              <Plus size={20} />
              <span>{showForm ? 'Cancel' : 'Add Property'}</span>
            </button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          {showForm && (
            <div className="bg-white p-6 rounded-lg shadow mb-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingId ? 'Edit Property' : 'Add New Property'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Property Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={formData.url_pattern}
                  onChange={(e) => setFormData({ ...formData, url_pattern: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="WiFi SSID"
                    value={formData.wifi_ssid}
                    onChange={(e) => setFormData({ ...formData, wifi_ssid: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <input
                    type="password"
                    placeholder={editingId ? 'WiFi Password (leave blank to keep)' : 'WiFi Password'}
                    value={formData.wifi_password}
                    onChange={(e) => setFormData({ ...formData, wifi_password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Checkout Time</label>
                    <input
                      type="time"
                      value={formData.checkout_time}
                      onChange={(e) => setFormData({ ...formData, checkout_time: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Tone Guidelines</label>
                    <input
                      type="text"
                      placeholder="Professional, formal, courteous"
                      value={formData.tone_guidelines}
                      onChange={(e) => setFormData({ ...formData, tone_guidelines: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    {editingId ? 'Save Changes' : 'Create Property'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="grid gap-4">
            {properties.map((property) => (
              <div key={property.id} className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-800">{property.name}</h3>
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                        {property.address || '\u2014'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>🕐 Checkout: {property.checkout_time || '\u2014'}</p>
                      <p className="flex items-center space-x-2">
                        <span>📶 WiFi: {property.wifi_ssid || '\u2014'}</span>
                        <button
                          onClick={() => toggleWifi(property.id)}
                          disabled={revealing === property.id}
                          className="inline-flex items-center space-x-1 text-blue-600 hover:underline disabled:opacity-60"
                          title={revealed[property.id] ? 'Hide password' : 'Reveal password (logged)'}
                        >
                          {revealed[property.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          <span>
                            {revealing === property.id
                              ? 'Revealing…'
                              : revealed[property.id] || 'Show password'}
                          </span>
                        </button>
                      </p>
                      {property.tone_guidelines && <p>🎭 {property.tone_guidelines}</p>}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(property)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                      aria-label="Edit property"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(property.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                      aria-label="Delete property"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && properties.length === 0 && !showForm && (
            <div className="text-center py-12">
              <p className="text-gray-500">No properties yet. Add your first property to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
