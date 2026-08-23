import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';
import { auditAPI } from '../services/api';
import { Calendar, User, FileText } from 'lucide-react';

export const AuditPage = () => {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await auditAPI.getLogs(100, 0);
      setLogs(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load audit logs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && logs.length === 0) return <LoadingSpinner />;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 bg-gray-50 overflow-auto">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-8">Audit Logs</h1>

          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
                      <h3 className="text-lg font-semibold text-gray-800">{log.action}</h3>
                    </div>
                    {log.details && (
                      <div className="bg-gray-50 p-3 rounded mt-2 text-sm text-gray-600 max-h-24 overflow-auto">
                        <pre>{JSON.stringify(JSON.parse(log.details), null, 2)}</pre>
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="flex items-center space-x-1 text-xs text-gray-500 mb-2">
                      <Calendar size={14} />
                      <span>{new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {logs.length === 0 && (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No audit logs yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
