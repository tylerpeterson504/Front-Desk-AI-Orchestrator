import React from 'react';
import { TemplatesPage } from './pages/TemplatesPage';
import { AuditPage } from './pages/AuditPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { ShiftNotesPage } from './pages/ShiftNotesPage';
import { Sidebar } from './components/Sidebar';

function App() {
  const [page, setPage] = React.useState('templates');

  return (
    <div className="flex h-screen">
      <Sidebar page={page} onNavigate={setPage} />
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
