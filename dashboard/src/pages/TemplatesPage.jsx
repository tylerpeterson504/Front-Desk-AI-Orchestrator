import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';
import { templatesAPI } from '../services/api';
import { Plus, Edit2, Trash2, Search } from '../components/icons';

export const TemplatesPage = ({ embedded = false }) => {
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [showForm, setShowForm] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    category: 'greeting',
    content: '',
    tags: ''
  });

  React.useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await templatesAPI.getAll();
      setTemplates(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template) => {
    setFormData({
      name: template.name || '',
      category: template.category || 'greeting',
      content: template.content || '',
      tags: (template.tags || []).join(', ')
    });
    setEditingId(template.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ name: '', category: 'greeting', content: '', tags: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
      };
      if (editingId) {
        await templatesAPI.update(editingId, payload);
      } else {
        await templatesAPI.create(payload);
      }
      resetForm();
      await loadTemplates();
    } catch (err) {
      setError(err.message || 'Failed to save template');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await templatesAPI.delete(id);
        await loadTemplates();
      } catch (err) {
        setError('Failed to delete template');
      }
    }
  };

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  if (loading && templates.length === 0) return <LoadingSpinner />;

  return (
    <div className={embedded ? '' : 'flex h-screen'}>
      {!embedded && <Sidebar />}
      <div className={embedded ? '' : 'flex-1 bg-gray-50 overflow-auto'}>
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Templates</h1>
            <button
              onClick={() => (showForm ? resetForm() : setShowForm(true))}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              <Plus size={20} />
              <span>{showForm ? 'Cancel' : 'Add Template'}</span>
            </button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          {/* Search Bar */}
          <div className="mb-6 relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {showForm && (
            <div className="bg-white p-6 rounded-lg shadow mb-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingId ? 'Edit Template' : 'Add New Template'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Template Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="greeting">Greeting</option>
                  <option value="issue_resolution">Issue Resolution</option>
                  <option value="amenity_info">Amenity Info</option>
                  <option value="checkout">Checkout</option>
                  <option value="special_request">Special Request</option>
                </select>
                <textarea
                  placeholder="Template Content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  rows="5"
                  required
                />
                <input
                  type="text"
                  placeholder="Tags (comma separated)"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    {editingId ? 'Save Changes' : 'Create Template'}
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
            {filtered.map((template) => (
              <div key={template.id} className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-800">{template.name}</h3>
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                        {template.category}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-2">{template.content}</p>
                    {template.tags && (
                      <div className="flex flex-wrap gap-2">
                        {template.tags.map((tag, idx) => (
                          <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500">No templates found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
