import React from 'react';
import { TemplatesPage } from './pages/TemplatesPage';
import { AuditPage } from './pages/AuditPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { ShiftNotesPage } from './pages/ShiftNotesPage';
import { LoginPage } from './pages/LoginPage';
import { Sidebar } from './components/Sidebar';
import { LoadingSpinner } from './components/LoadingSpinner';
import { authAPI, tokenStore, onUnauthorized } from './services/api';

function App() {
  const [page, setPage] = React.useState('templates');
  const [user, setUser] = React.useState(null);
  // `checking` covers the first paint: a stored token may be expired, so we
  // validate it before deciding between the app and the login screen.
  const [checking, setChecking] = React.useState(Boolean(tokenStore.get()));

  React.useEffect(() => {
    // Any 401 from any page drops us back to login, so an expired token cannot
    // leave the user staring at empty tables.
    return onUnauthorized(() => setUser(null));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    if (!tokenStore.get()) return undefined;

    authAPI
      .me()
      .then(({ data }) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke the session server-side, not just locally: clearing localStorage
  // used to leave the token valid until it expired.
  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } finally {
      tokenStore.clear();
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
