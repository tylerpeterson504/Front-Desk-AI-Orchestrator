import { useForm, UseFormReturn, FieldValues, UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z, ZodType, ZodTypeDef } from 'zod';
import React from 'react';

// Generic form hook with Zod validation
export function useZodForm<T extends FieldValues>(
  schema: ZodType<T, ZodTypeDef, T>,
  props?: Omit<UseFormProps<T>, 'resolver'>
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema),
    ...props
  });
}

// Form submission handler type
export type FormSubmitHandler<T extends FieldValues> = (data: T) => Promise<void> | void;

// Common form schemas

// Property form schema
export const propertyFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  checkout_time: z.string().optional(),
  wifi_ssid: z.string().optional(),
  wifi_password: z.string().optional(),
  tone_guidelines: z.string().optional()
});

export type PropertyFormData = z.infer<typeof propertyFormSchema>;

// Template form schema
export const templateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  content: z.string().min(1, 'Content is required'),
  property_id: z.number().optional(),
  is_global: z.boolean().default(false)
});

export type TemplateFormData = z.infer<typeof templateFormSchema>;

// Shift Note form schema
export const shiftNoteFormSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  property_id: z.number(),
  shift_date: z.string().min(1, 'Date is required')
});

export type ShiftNoteFormData = z.infer<typeof shiftNoteFormSchema>;

// Login form schema
export const loginFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export type LoginFormData = z.infer<typeof loginFormSchema>;

// Register form schema
export const registerFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().min(1, 'Name is required')
});

export type RegisterFormData = z.infer<typeof registerFormSchema>;

// Common form error display component
export interface FormErrorProps {
  error?: string;
  className?: string;
}

export const FormError: React.FC<FormErrorProps> = ({ error, className = '' }) => {
  if (!error) return null;
  
  return (
    <p className={'text-sm text-red-500 mt-1 ' + className}>
      {error}
    </p>
  );
};

// Form field wrapper
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required = false,
  children,
  className = ''
}) => (
  <div className={'mb-4 ' + className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {error && <FormError error={error} />}
  </div>
);

// Submit button with loading state
interface SubmitButtonProps {
  isSubmitting: boolean;
  children: React.ReactNode;
  className?: string;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  isSubmitting,
  children,
  className = ''
}) => (
  <button
    type="submit"
    disabled={isSubmitting}
    className={'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ' + className}
  >
    {isSubmitting ? (
      <>
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Processing...
      </>
    ) : (
      children
    )}
  </button>
);
