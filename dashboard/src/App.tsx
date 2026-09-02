import React from 'react';
import { TemplatesPage } from './pages/TemplatesPage';
import { AuditPage } from './pages/AuditPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { ShiftNotesPage } from './pages/ShiftNotesPage';
import { LoginPage } from './pages/LoginPage';
import { Sidebar } from './components/Sidebar';
import { LoadingSpinner } from './components/LoadingSpinner';
import { authAPI } from './services/api';
import { useAuthStore } from './stores/authStore';
import { User } from './types';

function App() {
  const [page, setPage] = React.useState<import('./types').PageType>('templates');
  const [user, setUser] = React.useState<User | null>(null);
  const [checking, setChecking] = React.useState(true);
  const { token, clearCredentials, setCredentials } = useAuthStore();

  React.useEffect(() => {
    // Check if we have a token
    setChecking(Boolean(token));
  }, [token]);

  React.useEffect(() => {
    let cancelled = false;
    if (!token) {
      setChecking(false);
      return undefined;
    }

    authAPI
      .me()
      .then((response) => {
        if (!cancelled) {
          setUser(response);
          setChecking(false);
        }
      })
      .catch(() => {
        clearCredentials();
        if (!cancelled) {
          setUser(null);
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, clearCredentials]);

  // Revoke the session server-side, not just locally: clearing localStorage
  // used to leave the token valid until it expired.
  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } finally {
      clearCredentials();
      setUser(null);
      setPage('templates');
    }
  };

  if (checking) return <LoadingSpinner />;
  if (!user) return <LoginPage onAuthenticated={setUser} />;

  return (
    <div className="flex h-screen">
      <Sidebar page={page} onNavigate={setPage} user={user} onLogout={handleLogout} />
      <div className="flex-1 overflow-auto">
        {page === 'templates' && <TemplatesPage embedded />}
        {page === 'audit' && <AuditPage embedded />}
        {page === 'properties' && <PropertiesPage embedded />}
        {page === 'shift-notes' && <ShiftNotesPage embedded />}
      </div>
    </div>
  );
}

export default App;
