import React from 'react';

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({
  title = 'No data available',
  subtitle,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      {icon && (
        <div className="mx-auto mb-4 flex items-center justify-center h-16 w-16 rounded-full bg-gray-100">
          {icon}
        </div>
      )}
      
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      
      {subtitle && (
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      )}
      
      {action && (
        <div className="mt-6">{action}</div>
      )}
    </div>
  );
}

export default EmptyState;
