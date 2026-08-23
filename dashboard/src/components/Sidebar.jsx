import React from 'react';
import { Home, FileText, ClipboardList, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Templates', href: '/templates', icon: FileText },
  { label: 'Audit Logs', href: '/audit', icon: ClipboardList }
];

export const Sidebar = () => {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <aside className="w-64 bg-blue-800 text-white flex flex-col h-screen">
      <div className="p-6 border-b border-blue-700">
        <h1 className="text-xl font-bold">🏨 Desk AI</h1>
        <p className="text-blue-300 text-sm mt-1">Front Desk Copilot</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = window.location.pathname === href;
          return (
            <a
              key={href}
              href={href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:bg-blue-700 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </a>
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
