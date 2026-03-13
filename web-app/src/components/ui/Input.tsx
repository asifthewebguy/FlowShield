'use client';

import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, error, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full h-10 rounded-lg',
              'bg-white dark:bg-surface-2',
              'border text-gray-900 dark:text-white',
              'text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600',
              'transition-all duration-150',
              error
                ? 'border-danger-400 dark:border-danger-500/50 focus:ring-2 focus:ring-danger-400/30'
                : 'border-gray-200 dark:border-white/[0.08] focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 dark:focus:border-primary-500/50',
              'outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              icon ? 'pl-10 pr-4' : 'px-4',
              className,
            ].filter(Boolean).join(' ')}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error && inputId ? `${inputId}-error` : undefined}
            {...props}
          />
        </div>
        {error && (
          <p
            id={inputId ? `${inputId}-error` : undefined}
            className="mt-1.5 text-xs text-danger-500"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
