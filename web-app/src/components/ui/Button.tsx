'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-gradient-to-b from-primary-500 to-primary-600',
    'text-white font-medium',
    'shadow-md shadow-primary-500/20',
    'hover:from-primary-400 hover:to-primary-500',
    'hover:shadow-lg hover:shadow-primary-500/30',
    'active:from-primary-600 active:to-primary-700',
    'focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-0',
    'disabled:from-gray-300 disabled:to-gray-400 disabled:text-gray-500 disabled:shadow-none dark:disabled:from-surface-3 dark:disabled:to-surface-4 dark:disabled:text-gray-500',
  ].join(' '),

  secondary: [
    'bg-white dark:bg-surface-3',
    'text-gray-700 dark:text-gray-200',
    'border border-gray-200 dark:border-white/[0.08]',
    'shadow-sm',
    'hover:bg-gray-50 dark:hover:bg-surface-4',
    'hover:border-gray-300 dark:hover:border-white/[0.12]',
    'active:bg-gray-100 dark:active:bg-surface-2',
    'focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-0',
    'disabled:opacity-50 disabled:pointer-events-none',
  ].join(' '),

  ghost: [
    'bg-transparent',
    'text-gray-600 dark:text-gray-400',
    'hover:bg-gray-100 dark:hover:bg-white/[0.06]',
    'hover:text-gray-900 dark:hover:text-gray-200',
    'active:bg-gray-200 dark:active:bg-white/[0.1]',
    'focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-0',
    'disabled:opacity-50 disabled:pointer-events-none',
  ].join(' '),

  danger: [
    'bg-gradient-to-b from-danger-500 to-danger-600',
    'text-white font-medium',
    'shadow-md shadow-danger-500/20',
    'hover:from-danger-400 hover:to-danger-500',
    'hover:shadow-lg hover:shadow-danger-500/30',
    'active:from-danger-600 active:to-danger-700',
    'focus-visible:ring-2 focus-visible:ring-danger-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-0',
    'disabled:opacity-50 disabled:pointer-events-none',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9 px-4 text-sm rounded-lg gap-2',
  lg: 'h-11 px-6 text-base rounded-xl gap-2.5',
};

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, disabled, className = '', children, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center',
          'font-medium whitespace-nowrap select-none',
          'transition-all duration-150 ease-out',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      >
        {loading ? (
          <Spinner />
        ) : icon ? (
          <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
