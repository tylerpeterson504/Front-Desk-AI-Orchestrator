import React from 'react';

export const Alert = ({ type = 'error', message, onClose }) => {
  const colors = {
    error: 'bg-red-100 text-red-800 border-red-300',
    success: 'bg-green-100 text-green-800 border-green-300',
    info: 'bg-blue-100 text-blue-800 border-blue-300'
  };
  return (
    <div className={`flex justify-between items-center p-4 mb-4 border rounded ${colors[type] || colors.info}`}>
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-4 font-bold">×</button>
      )}
    </div>
  );
};
