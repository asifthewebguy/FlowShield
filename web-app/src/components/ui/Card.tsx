'use client';

import { forwardRef } from 'react';

type CardVariant = 'default' | 'glass' | 'elevated' | 'interactive';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  gradient?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles: Record<CardVariant, string> = {
  default: [
    'bg-white dark:bg-surface-2',
    'border border-gray-200/60 dark:border-white/[0.06]',
    'shadow-sm dark:shadow-none',
  ].join(' '),

  glass: [
    'glass',
    'shadow-lg shadow-black/[0.03] dark:shadow-black/[0.2]',
  ].join(' '),

  elevated: [
    'bg-white dark:bg-surface-2',
    'border border-gray-200/60 dark:border-white/[0.06]',
    'shadow-lg shadow-gray-200/50 dark:shadow-black/40',
    'dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
  ].join(' '),

  interactive: [
    'bg-white dark:bg-surface-2',
    'border border-gray-200/60 dark:border-white/[0.06]',
    'shadow-sm dark:shadow-none',
    'transition-all duration-200 ease-out',
    'hover:scale-[1.01] hover:shadow-lg',
    'hover:border-primary-300/40 dark:hover:border-primary-500/20',
    'hover:shadow-primary-500/[0.06] dark:hover:shadow-primary-500/[0.08]',
    'active:scale-[0.995]',
    'cursor-pointer',
  ].join(' '),
};

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', gradient = false, padding = 'md', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'rounded-xl relative overflow-hidden',
          variantStyles[variant],
          paddingStyles[padding],
          gradient ? 'gradient-border' : '',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export { Card };
export type { CardProps, CardVariant };
