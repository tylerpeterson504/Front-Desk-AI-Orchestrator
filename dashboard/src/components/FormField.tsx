import React, { useState, useCallback } from 'react';
import { useFormContext, Controller, FieldError } from 'react-hook-form';
import { EyeIcon, EyeOffIcon, AlertCircleIcon } from 'lucide-react';

interface FormFieldProps {
  name: string;
  label?: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'time' | 'datetime-local';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  errorClassName?: string;
  helperText?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  autoComplete?: string;
  min?: string | number;
  max?: string | number;
  pattern?: string;
  onChange?: (value: string | boolean, event?: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
}

function FormField({
  name,
  label,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  readOnly = false,
  className = '',
  labelClassName = '',
  inputClassName = '',
  errorClassName = '',
  helperText,
  options,
  rows = 4,
  autoComplete,
  min,
  max,
  pattern,
  onChange,
  onBlur,
  children,
}: FormFieldProps) {
  const { 
    control, 
    formState: { errors }, 
    watch 
  } = useFormContext();
  
  const [showPassword, setShowPassword] = useState(false);
  const error = errors[name] as FieldError;

  const handleChange = useCallback((value: string | boolean, event?: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (onChange) {
      onChange(value, event);
    }
  }, [onChange]);

  const renderInput = () => {
    switch (type) {
      case 'textarea':
        return (
          <textarea
            {...(control?._fields[name]?.ref ? { ref: control._fields[name].ref } : {})}
            name={name}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            rows={rows}
            autoComplete={autoComplete}
            className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${inputClassName} ${error ? 'border-red-500' : 'border'}`}
            onChange={(e) => handleChange(e.target.value, e)}
            onBlur={onBlur}
          />
        );

      case 'select':
        return (
          <select
            {...(control?._fields[name]?.ref ? { ref: control._fields[name].ref } : {})}
            name={name}
            disabled={disabled}
            readOnly={readOnly}
            autoComplete={autoComplete}
            className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${inputClassName} ${error ? 'border-red-500' : 'border'}`}
            onChange={(e) => handleChange(e.target.value, e)}
            onBlur={onBlur}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              {...(control?._fields[name]?.ref ? { ref: control._fields[name].ref } : {})}
              name={name}
              disabled={disabled}
              readOnly={readOnly}
              className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${inputClassName}`}
              onChange={(e) => handleChange(e.target.checked, e)}
              onBlur={onBlur}
            />
            {label && <span className="ml-2 text-sm text-gray-700">{label}</span>}
          </div>
        );

      case 'password':
        return (
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              {...(control?._fields[name]?.ref ? { ref: control._fields[name].ref } : {})}
              name={name}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              autoComplete={autoComplete}
              min={min}
              max={max}
              pattern={pattern}
              className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${inputClassName} ${error ? 'border-red-500' : 'border'}`}
              onChange={(e) => handleChange(e.target.value, e)}
              onBlur={onBlur}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOffIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {options?.map((option) => (
              <div key={option.value} className="flex items-center">
                <input
                  type="radio"
                  {...(control?._fields[name]?.ref ? { ref: control._fields[name].ref } : {})}
                  name={name}
                  value={option.value}
                  disabled={disabled}
                  readOnly={readOnly}
                  className={`h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 ${inputClassName}`}
                  onChange={(e) => handleChange(e.target.value, e)}
                  onBlur={onBlur}
                />
                <label className="ml-2 text-sm text-gray-700">
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        );

      default:
        return (
          <input
            type={type}
            {...(control?._fields[name]?.ref ? { ref: control._fields[name].ref } : {})}
            name={name}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            autoComplete={autoComplete}
            min={min}
            max={max}
            pattern={pattern}
            className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${inputClassName} ${error ? 'border-red-500' : 'border'}`}
            onChange={(e) => handleChange(e.target.value, e)}
            onBlur={onBlur}
          />
        );
    }
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && type !== 'checkbox' && type !== 'radio' && (
        <label className={`block text-sm font-medium text-gray-700 mb-1 ${labelClassName}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <Controller
        name={name}
        control={control}
        render={({ field }) => {
          // Merge field props with our render
          const inputProps = {
            ...field,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
              field.onChange(e);
              handleChange(e.target.value, e);
            },
            onBlur: () => {
              field.onBlur();
              if (onBlur) onBlur();
            },
            value: field.value || ''
          };

          if (type === 'checkbox') {
            return (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...inputProps}
                  checked={Boolean(field.value)}
                  className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${inputClassName} ${error ? 'border-red-500' : 'border'}`}
                />
                {label && <span className="ml-2 text-sm text-gray-700">{label}</span>}
              </div>
            );
          }

          return renderInput();
        }}
      />

      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}

      {error && (
        <p className={`mt-1 text-sm text-red-600 flex items-center ${errorClassName}`}>
          <AlertCircleIcon className="h-4 w-4 mr-1" />
          {error.message}
        </p>
      )}
    </div>
  );
}

export default FormField;
