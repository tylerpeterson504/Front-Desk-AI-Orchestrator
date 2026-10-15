import React from 'react';
import { TemplatesPage } from './pages/TemplatesPage';
import { AuditPage } from './pages/AuditPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { ShiftNotesPage } from './pages/ShiftNotesPage';
import { EscalationsPage } from './pages/EscalationsPage';
import { LoginPage } from './pages/LoginPage';
import { Sidebar } from './components/Sidebar';
import { LoadingSpinner } from './components/LoadingSpinner';
import { authAPI, refreshAccessToken, setOnUnauthorized } from './services/api';
import { resetDataStores } from './stores';
import { useAuthStore, tokenStore } from './stores/authStore';
import type { User } from './types';

function App() {
  const [page, setPage] = React.useState<import('./types').PageType>('templates');
  const [user, setUser] = React.useState<User | null>(null);
  const [checking, setChecking] = React.useState(true);
  const { clearCredentials } = useAuthStore();

  React.useEffect(() => {
    setOnUnauthorized(() => setUser(null));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        if (!tokenStore.get()) await refreshAccessToken();
        const response: User = await authAPI.me();
        if (!cancelled) setUser(response);
      } catch {
        clearCredentials();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [clearCredentials]);

  // Revoke the session server-side, not just locally: clearing localStorage
  // used to leave the token valid until it expired.
  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } finally {
      clearCredentials();
      resetDataStores();
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
        {page === 'escalations' && <EscalationsPage embedded />}
      </div>
    </div>
  );
}

export default App;
