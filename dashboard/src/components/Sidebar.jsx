import React from 'react';

export const Sidebar = () => (
  <div className="w-64 bg-gray-800 text-white flex flex-col">
    <div className="p-6 text-xl font-bold border-b border-gray-700">
      Front Desk AI
    </div>
    <nav className="flex-1 p-4 space-y-2">
      <a href="#templates" className="block px-4 py-2 rounded hover:bg-gray-700">
        Templates
      </a>
      <a href="#audit" className="block px-4 py-2 rounded hover:bg-gray-700">
        Audit Logs
      </a>
    </nav>
  </div>
);
