import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  rowsPerPage?: number;
  rowsPerPageOptions?: number[];
  totalItems?: number;
  className?: string;
  showPageNumbers?: boolean;
  maxPageNumbers?: number;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPage = 10,
  rowsPerPageOptions = [10, 25, 50, 100],
  totalItems = 0,
  className = '',
  showPageNumbers = true,
  maxPageNumbers = 5,
}: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const half = Math.floor(maxPageNumbers / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxPageNumbers - 1);
    
    // Adjust start if we're at the end
    if (end - start + 1 < maxPageNumbers) {
      start = Math.max(1, end - maxPageNumbers + 1);
    }
    
    // Add first page and ellipsis if needed
    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push('...');
      }
    }
    
    // Add page numbers
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    // Add last page and ellipsis if needed
    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={`flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 ${className}`}>
      <div className="flex items-center space-x-2">
        {onRowsPerPageChange && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              {rowsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <div className="text-sm text-gray-500">
          Showing {((currentPage - 1) * rowsPerPage + 1)}-{Math.min(currentPage * rowsPerPage, totalItems)} of {totalItems}
        </div>

        <div className="flex space-x-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
            title="First page"
          >
            <ChevronDoubleLeftIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
            title="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>

          {showPageNumbers && (
            <div className="flex items-center space-x-1">
              {pageNumbers.map((page, index) =>
                typeof page === 'number' ? (
                  <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`px-2 py-1 text-sm rounded ${currentPage === page ? 'bg-blue-500 text-white' : 'border border-gray-300 hover:bg-gray-50'}`}
                  >
                    {page}
                  </button>
                ) : (
                  <span key={`ellipsis-${index}`} className="px-2 py-1 text-gray-400">
                    {page}
                  </span>
                )
              )}
            </div>
          )}

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
            title="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
            title="Last page"
          >
            <ChevronDoubleRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Pagination;
