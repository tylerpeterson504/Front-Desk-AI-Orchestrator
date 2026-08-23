import React from 'react';
import { X } from 'lucide-react';

const STYLES = {
  error: 'bg-red-50 border-red-400 text-red-800',
  success: 'bg-green-50 border-green-400 text-green-800',
  info: 'bg-blue-50 border-blue-400 text-blue-800'
};

export const Alert = ({ type = 'info', message, onClose }) => (
  <div className={`flex items-start justify-between border-l-4 p-4 rounded mb-4 ${STYLES[type]}`}>
    <p className="text-sm">{message}</p>
    {onClose && (
      <button onClick={onClose} className="ml-4 flex-shrink-0">
        <X size={16} />
      </button>
    )}
  </div>
);
