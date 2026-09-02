import React, { useState, useMemo, useCallback } from 'react';
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from 'lucide-react';

export interface Column<T> {
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
  keyExtractor: (item: T) => string;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  initialSortKey?: string;
  initialSortDirection?: 'asc' | 'desc';
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowClassName?: (item: T) => string;
  onRowClick?: (item: T) => void;
  selectedKeys?: string[];
  onSelect?: (keys: string[]) => void;
  onSelectAll?: (selectAll: boolean) => void;
}

type SortDirection = 'asc' | 'desc' | null;

export function Table<T>({
  data,
  columns,
  keyExtractor,
  onSort,
  initialSortKey,
  initialSortDirection,
  isLoading = false,
  emptyMessage = 'No data available',
  className = '',
  rowClassName,
  onRowClick,
  selectedKeys = [],
  onSelect,
  onSelectAll
}: TableProps<T>): React.ReactElement {
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection || null);

  const handleSort = useCallback((key: string) => {
    let newDirection: SortDirection = 'asc';
    
    if (sortKey === key) {
      newDirection = sortDirection === 'asc' ? 'desc' : sortDirection === 'desc' ? null : 'asc';
    }
    
    setSortKey(key);
    setSortDirection(newDirection);
    
    if (onSort && newDirection) {
      onSort(key, newDirection);
    }
  }, [sortKey, sortDirection, onSort]);

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (onSelectAll) {
      onSelectAll(e.target.checked);
    }
  }, [onSelectAll]);

  const handleRowSelect = useCallback((key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (onSelect) {
      const newSelectedKeys = e.target.checked
        ? [...selectedKeys, key]
        : selectedKeys.filter(k => k !== key);
      onSelect(newSelectedKeys);
    }
  }, [selectedKeys, onSelect]);

  const allSelected = useMemo(() => {
    if (data.length === 0 || selectedKeys.length === 0) return false;
    return data.every(item => selectedKeys.includes(keyExtractor(item)));
  }, [data, selectedKeys, keyExtractor]);

  const renderSortIcon = (key: string): React.ReactNode => {
    if (sortKey !== key) {
      return <ChevronsUpDownIcon className="h-4 w-4 text-gray-400" />;
    }
    
    if (sortDirection === 'asc') {
      return <ChevronUpIcon className="h-4 w-4 text-blue-600" />;
    }
    
    if (sortDirection === 'desc') {
      return <ChevronDownIcon className="h-4 w-4 text-blue-600" />;
    }
    
    return null;
  };

  if (isLoading) {
    return (
      <div className={'bg-white rounded-lg border border-gray-200 overflow-hidden ' + className}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  style={{ width: column.width }}
                >
                  <div className="flex items-center">
                    {column.header}
                    {column.sortable && (
                      <button
                        className="ml-2 p-1 rounded-full hover:bg-gray-100"
                        onClick={() => handleSort(column.key)}
                      >
                        {renderSortIcon(column.key)}
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={'bg-white rounded-lg border border-gray-200 overflow-hidden ' + className}>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  style={{ width: column.width }}
                >
                  <div className="flex items-center">
                    {column.header}
                    {column.sortable && (
                      <button
                        className="ml-2 p-1 rounded-full hover:bg-gray-100"
                        onClick={() => handleSort(column.key)}
                      >
                        {renderSortIcon(column.key)}
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={'bg-white rounded-lg border border-gray-200 overflow-hidden ' + className}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {onSelectAll && (
              <th className="px-6 py-3 w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                style={{ width: column.width }}
              >
                <div className="flex items-center">
                  {column.header}
                  {column.sortable && (
                    <button
                      className="ml-2 p-1 rounded-full hover:bg-gray-100"
                      onClick={() => handleSort(column.key)}
                    >
                      {renderSortIcon(column.key)}
                    </button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item, index) => {
            const key = keyExtractor(item);
            const isSelected = selectedKeys.includes(key);
            const rowClass = rowClassName ? rowClassName(item) : '';
            
            return (
              <tr
                key={key}
                className={'hover:bg-gray-50 ' + (onRowClick ? 'cursor-pointer' : '') + ' ' + rowClass}
                onClick={() => onRowClick && onRowClick(item)}
              >
                {onSelect && (
                  <td className="px-6 py-4 w-12">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleRowSelect(key, e)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={'px-6 py-4 whitespace-nowrap text-sm text-gray-900 ' + (column.className || '')}
                  >
                    {column.render
                      ? column.render(item, index)
                      : (item as Record<string, unknown>)[column.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
