import React, { useState, useMemo, useCallback } from 'react';
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowClassName?: (item: T, index: number) => string;
  onRowClick?: (item: T, index: number) => void;
  selectedRows?: (string | number)[];
  onSelectRow?: (id: string | number, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onRowsPerPageChange?: (rowsPerPage: number) => void;
    rowsPerPage?: number;
    rowsPerPageOptions?: number[];
  };
}

function Table<T>({
  data,
  columns,
  keyExtractor,
  onSort,
  sortBy,
  sortDirection,
  isLoading = false,
  emptyMessage = 'No data available',
  className = '',
  rowClassName,
  onRowClick,
  selectedRows = [],
  onSelectRow,
  onSelectAll,
  pagination,
}: TableProps<T>) {
  const [localSortBy, setLocalSortBy] = useState<string | undefined>(sortBy);
  const [localSortDirection, setLocalSortDirection] = useState<'asc' | 'desc' | undefined>(sortDirection);

  const handleSort = useCallback((key: string) => {
    let newDirection: 'asc' | 'desc' = 'asc';
    
    if (localSortBy === key) {
      newDirection = localSortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    setLocalSortBy(key);
    setLocalSortDirection(newDirection);
    
    if (onSort) {
      onSort(key, newDirection);
    }
  }, [localSortBy, localSortDirection, onSort]);

  const renderSortIcon = useCallback((key: string) => {
    if (localSortBy !== key) {
      return <ChevronsUpDownIcon className="h-4 w-4 text-gray-400" />;
    }
    
    return localSortDirection === 'asc' 
      ? <ChevronUpIcon className="h-4 w-4 text-blue-500" />
      : <ChevronDownIcon className="h-4 w-4 text-blue-500" />;
  }, [localSortBy, localSortDirection]);

  const handleRowClick = useCallback((item: T, index: number) => {
    if (onRowClick) {
      onRowClick(item, index);
    }
  }, [onRowClick]);

  const handleSelectRow = useCallback((id: string | number, event: React.ChangeEvent<HTMLInputElement>) => {
    if (onSelectRow) {
      onSelectRow(id, event.target.checked);
    }
  }, [onSelectRow]);

  const handleSelectAll = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (onSelectAll) {
      onSelectAll(event.target.checked);
    }
  }, [onSelectAll]);

  const allSelected = useMemo(() => {
    return data.length > 0 && selectedRows.length === data.length && data.every(item => 
      selectedRows.includes(keyExtractor(item))
    );
  }, [data, selectedRows, keyExtractor]);

  const someSelected = useMemo(() => {
    return selectedRows.length > 0 && !allSelected;
  }, [selectedRows, allSelected]);

  const renderHeaderCell = useCallback((column: Column<T>) => {
    if (column.key === 'select' && onSelectAll) {
      return (
        <th key="select" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => {
              if (el) {
                el.indeterminate = someSelected && !allSelected;
              }
            }}
            onChange={handleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </th>
      );
    }

    return (
      <th
        key={column.key}
        className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''} ${column.className || ''}`}
        onClick={() => column.sortable && handleSort(column.key)}
        style={{ width: column.width || 'auto' }}
      >
        <div className="flex items-center">
          {column.header}
          {column.sortable && renderSortIcon(column.key)}
        </div>
      </th>
    );
  }, [handleSort, renderSortIcon, allSelected, someSelected, handleSelectAll, onSelectAll]);

  const renderCell = useCallback((column: Column<T>, item: T, index: number) => {
    if (column.key === 'select' && onSelectRow) {
      const id = keyExtractor(item);
      return (
        <td key="select" className="px-4 py-3 whitespace-nowrap">
          <input
            type="checkbox"
            checked={selectedRows.includes(id)}
            onChange={(e) => handleSelectRow(id, e)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </td>
      );
    }

    const value = column.render ? column.render(item, index) : (item as Record<string, unknown>)[column.key];
    
    return (
      <td
        key={column.key}
        className={`px-4 py-3 whitespace-nowrap ${column.className || ''}`}
        onClick={() => handleRowClick(item, index)}
      >
        {value !== undefined ? value : null}
      </td>
    );
  }, [keyExtractor, selectedRows, handleSelectRow, handleRowClick]);

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow ${className}`}>
        <div className="px-4 py-8 text-center text-gray-500">
          Loading...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow ${className}`}>
        <div className="px-4 py-8 text-center text-gray-500">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(renderHeaderCell)}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => {
              const rowKey = keyExtractor(item);
              const rowClass = rowClassName ? rowClassName(item, index) : '';
              
              return (
                <tr
                  key={rowKey}
                  className={`hover:bg-gray-50 transition-colors ${rowClass} ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick && handleRowClick(item, index)}
                >
                  {columns.map((column) => renderCell(column, item, index))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="text-sm text-gray-500">
              Showing {((pagination.currentPage - 1) * (pagination.rowsPerPage || 10) + 1)}-{
                Math.min(pagination.currentPage * (pagination.rowsPerPage || 10), pagination.totalPages * (pagination.rowsPerPage || 10))
              } of {pagination.totalPages * (pagination.rowsPerPage || 10)}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {pagination.rowsPerPageOptions && pagination.onRowsPerPageChange && (
              <select
                value={pagination.rowsPerPage || 10}
                onChange={(e) => pagination.onRowsPerPageChange?.(Number(e.target.value))}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                {pagination.rowsPerPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} per page
                  </option>
                ))}
              </select>
            )}

            <div className="flex space-x-1">
              <button
                onClick={() => pagination.onPageChange(Math.max(1, pagination.currentPage - 1))}
                disabled={pagination.currentPage <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <button
                onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.currentPage + 1))}
                disabled={pagination.currentPage >= pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Table;
