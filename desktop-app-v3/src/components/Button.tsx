import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary-500 hover:bg-primary-600 text-white border-primary-500 hover:border-primary-600',
  secondary:
    'bg-surface-2 hover:bg-surface-3 text-gray-800 dark:text-gray-200 border-surface-3',
  ghost:
    'bg-transparent hover:bg-surface-2 text-gray-700 dark:text-gray-300 border-transparent',
  danger:
    'bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className ?? '',
        ].join(' ')}
        {...rest}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" className="opacity-75" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
