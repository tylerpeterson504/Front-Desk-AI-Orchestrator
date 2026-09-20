import React from 'react';
import { useForm } from 'react-hook-form';
import { EyeIcon, EyeOffIcon, PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { propertyAPI, Property } from '../services/api';
import { usePropertiesStore } from '../stores/propertiesStore';

interface FormData {
  name: string;
  address: string;
  checkout_time: string;
  wifi_ssid: string;
  wifi_password: string;
  tone_guidelines: string;
}

const emptyForm: FormData = {
  name: '',
  address: '',
  checkout_time: '11:00',
  wifi_ssid: '',
  wifi_password: '',
  tone_guidelines: '',
};

interface PropertiesPageProps {
  embedded?: boolean;
}

export function PropertiesPage({ embedded = false }: PropertiesPageProps = {}) {
  const {
    properties,
    isLoading,
    error,
    fetchProperties,
    createProperty,
    updateProperty,
    deleteProperty,
  } = usePropertiesStore();

  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [confirmId, setConfirmId] = React.useState<number | null>(null);
  const [revealed, setRevealed] = React.useState<Record<number, boolean>>({});
  const [revealing, setRevealing] = React.useState<number | null>(null);
  const [wifiPasswords, setWifiPasswords] = React.useState<Record<number, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: emptyForm });

  React.useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const toggleWifi = async (prop: Property) => {
    if (revealed[prop.id]) {
      setRevealed((prev) => ({ ...prev, [prop.id]: false }));
      return;
    }
    setRevealing(prop.id);
    try {
      const data = await propertyAPI.getWifi(prop.id);
      setWifiPasswords((prev) => ({ ...prev, [prop.id]: data.password }));
      setRevealed((prev) => ({ ...prev, [prop.id]: true }));
    } catch {
      setWifiPasswords((prev) => ({
        ...prev,
        [prop.id]: prop.wifi_password || '',
      }));
      setRevealed((prev) => ({ ...prev, [prop.id]: true }));
    } finally {
      setRevealing(null);
    }
  };

  const onSubmit = async (formData: FormData) => {
    const payload: Partial<FormData> = { ...formData };
    if (!payload.wifi_password) {
      delete payload.wifi_password;
    }
    if (editingId !== null) {
      await updateProperty(editingId, payload);
    } else {
      await createProperty(payload);
    }
    setShowForm(false);
    setEditingId(null);
    reset(emptyForm);
  };

  const startEdit = (prop: Property) => {
    setEditingId(prop.id);
    setShowForm(true);
    reset({
      name: prop.name,
      address: prop.address || '',
      checkout_time: prop.checkout_time || '11:00',
      wifi_ssid: prop.wifi_ssid || '',
      wifi_password: prop.wifi_password || '',
      tone_guidelines: prop.tone_guidelines || '',
    });
  };

  const handleDelete = async () => {
    if (confirmId !== null) {
      await deleteProperty(confirmId);
      setConfirmId(null);
    }
  };

  return (
    <div className={embedded ? 'p-6' : 'p-8'}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            onClick={() => {
              setShowForm((s) => !s);
              setEditingId(null);
              reset(emptyForm);
            }}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Property
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {showForm && (
          <form
            className="mb-6 rounded-lg border bg-white p-6 shadow-sm"
            onSubmit={handleSubmit(onSubmit)}
          >
            <h2 className="text-lg font-semibold mb-4">
              {editingId !== null ? 'Edit Property' : 'New Property'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('name', { required: 'Name is required' })}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('address')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Checkout time
                </label>
                <input
                  type="time"
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('checkout_time')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WiFi SSID</label>
                <input
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('wifi_ssid')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WiFi Password
                </label>
                <input
                  type="password"
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('wifi_password')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tone guidelines
                </label>
                <input
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('tone_guidelines')}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 rounded-md border hover:bg-gray-50"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset(emptyForm);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                {editingId !== null ? 'Save Changes' : 'Create Property'}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <p className="text-gray-500">Loading properties...</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    WiFi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Checkout
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {properties.map((prop: Property) => (
                  <tr key={prop.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{prop.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{prop.address || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <button
                        type="button"
                        className="inline-flex items-center text-blue-600 hover:text-blue-800"
                        onClick={() => toggleWifi(prop)}
                      >
                        {revealing === prop.id ? (
                          'Loading...'
                        ) : revealed[prop.id] ? (
                          <>
                            <EyeOffIcon className="h-4 w-4 mr-1" />
                            {wifiPasswords[prop.id]}
                          </>
                        ) : (
                          <>
                            <EyeIcon className="h-4 w-4 mr-1" />
                            Reveal
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {prop.checkout_time || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="mr-3 text-blue-600 hover:text-blue-800"
                        onClick={() => startEdit(prop)}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => setConfirmId(prop.id)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmId !== null}
        title="Delete Property"
        message="Are you sure you want to delete this property? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}

export default PropertiesPage;
