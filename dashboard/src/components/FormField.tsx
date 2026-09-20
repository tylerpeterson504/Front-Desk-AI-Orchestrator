import React from 'react';
import { useFormContext, Controller, FieldError } from 'react-hook-form';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

interface FormFieldProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  disabled?: boolean;
  hint?: string;
}

export function FormField({
  name,
  label,
  type = 'text',
  placeholder,
  required = false,
  options,
  rows,
  disabled = false,
  hint,
}: FormFieldProps) {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = React.useState(false);
  const error = undefined as FieldError | undefined;

  const baseClasses =
    'block w-full rounded-md border shadow-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 ';
  const normalClasses = baseClasses + 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
  const errorClasses = baseClasses + 'border-red-300 focus:border-red-500 focus:ring-red-500';

  return (
    <div className="mb-4">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => {
          const hasError = Boolean(fieldState.error);
          const cls = hasError ? errorClasses : normalClasses;
          if (type === 'select' && options) {
            return (
              <select
                id={name}
                className={cls}
                disabled={disabled}
                name={field.name}
                ref={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
                value={field.value ?? ''}
              >
                <option value="">Select...</option>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            );
          }
          if (type === 'textarea') {
            return (
              <textarea
                id={name}
                className={cls}
                placeholder={placeholder}
                disabled={disabled}
                rows={rows ?? 3}
                name={field.name}
                ref={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
                value={field.value ?? ''}
              />
            );
          }
          if (type === 'checkbox') {
            return (
              <input
                id={name}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={disabled}
                name={field.name}
                ref={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
                checked={Boolean(field.value)}
              />
            );
          }
          const isPassword = type === 'password';
          return (
            <div className="relative">
              <input
                id={name}
                type={isPassword && showPassword ? 'text' : type}
                className={isPassword ? cls + ' pr-10' : cls}
                placeholder={placeholder}
                disabled={disabled}
                name={field.name}
                ref={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
                value={field.value ?? ''}
              />
              {isPassword && (
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              )}
            </div>
          );
        }}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default FormField;
