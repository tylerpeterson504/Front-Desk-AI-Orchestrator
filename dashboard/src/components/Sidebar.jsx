import React from 'react';
import { Home, FileText, ClipboardList, LogOut, Building2, StickyNote } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'shift-notes', label: 'Shift Notes', icon: StickyNote },
  { id: 'audit', label: 'Audit Logs', icon: ClipboardList }
];

export const Sidebar = ({ page, onNavigate }) => {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <aside className="w-64 bg-blue-800 text-white flex flex-col h-screen flex-shrink-0">
      <div className="p-6 border-b border-blue-700">
        <h1 className="text-xl font-bold">🏨 Desk AI</h1>
        <p className="text-blue-300 text-sm mt-1">Front Desk Copilot</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors w-full text-left ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:bg-blue-700 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-blue-700">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg text-blue-200 hover:bg-blue-700 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
