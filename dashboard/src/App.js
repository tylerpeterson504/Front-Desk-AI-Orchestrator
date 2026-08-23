import React from 'react';
import { TemplatesPage } from './pages/TemplatesPage';
import { AuditPage } from './pages/AuditPage';

function App() {
  const [page, setPage] = React.useState('templates');

  return (
    <div>
      {page === 'templates' && <TemplatesPage />}
      {page === 'audit' && <AuditPage />}
    </div>
  );
}

export default App;
