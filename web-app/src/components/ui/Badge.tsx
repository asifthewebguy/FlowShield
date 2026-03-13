'use client';

type BadgeVariant = 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400',
  primary: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400',
  accent: 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-400',
  success: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400',
  danger: 'bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-400 dark:bg-gray-500',
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[11px] px-2 py-0.5 rounded',
  md: 'text-xs px-2.5 py-1 rounded-md',
};

function Badge({
  variant = 'default',
  size = 'sm',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-medium whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant, BadgeSize };
