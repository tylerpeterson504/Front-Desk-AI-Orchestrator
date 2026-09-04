import React, { useState, useCallback, useEffect } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';

interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

function SearchInput({
  value: externalValue,
  onChange,
  onSearch,
  placeholder = 'Search...',
  debounceMs = 300,
  className = '',
  inputClassName = '',
  disabled = false,
}: SearchInputProps) {
  const [value, setValue] = useState(externalValue || '');
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Sync external value changes
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== value) {
      setValue(externalValue);
    }
  }, [externalValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set new timeout for debounced onChange
    if (onChange) {
      const newTimeoutId = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);
      setTimeoutId(newTimeoutId);
    }
  }, [onChange, debounceMs, timeoutId]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(value);
    }
  }, [onSearch, value]);

  const handleClear = useCallback(() => {
    setValue('');
    if (onChange) {
      onChange('');
    }
    if (onSearch) {
      onSearch('');
    }
  }, [onChange, onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  }, [handleClear]);

  return (
    <form onSubmit={handleSubmit} className={`relative ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
          <SearchIcon className="h-5 w-5 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`block w-full pl-10 pr-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${inputClassName}`}
        />
        
        {value && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

export default SearchInput;
