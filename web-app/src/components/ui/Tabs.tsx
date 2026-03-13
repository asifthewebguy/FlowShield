'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

type TabSize = 'sm' | 'md';

interface Tab {
  label: string;
  value: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (value: string) => void;
  size?: TabSize;
  className?: string;
}

const sizeStyles: Record<TabSize, { container: string; tab: string }> = {
  sm: {
    container: 'h-8 p-0.5 rounded-lg',
    tab: 'text-xs px-3 rounded-md',
  },
  md: {
    container: 'h-10 p-1 rounded-xl',
    tab: 'text-sm px-4 rounded-lg',
  },
};

function Tabs({ tabs, activeTab, onChange, size = 'md', className = '' }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeIndex = tabs.findIndex(t => t.value === activeTab);
    if (activeIndex === -1) return;

    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const activeButton = buttons[activeIndex];
    if (!activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setIndicator({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
  }, [tabs, activeTab]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const styles = sizeStyles[size];

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={[
        'relative inline-flex items-center',
        'bg-gray-100 dark:bg-white/[0.04]',
        'border border-gray-200/50 dark:border-white/[0.04]',
        styles.container,
        className,
      ].join(' ')}
    >
      {/* Sliding indicator */}
      <div
        className={[
          'absolute top-0.5 bottom-0.5 transition-all duration-200 ease-out',
          'bg-white dark:bg-surface-3',
          'shadow-sm dark:shadow-none',
          'border border-gray-200/60 dark:border-white/[0.08]',
          size === 'sm' ? 'rounded-md' : 'rounded-lg',
        ].join(' ')}
        style={{
          left: `${indicator.left}px`,
          width: `${indicator.width}px`,
        }}
        aria-hidden="true"
      />

      {tabs.map((tab) => {
        const isActive = tab.value === activeTab;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={[
              'relative z-10 flex items-center justify-center font-medium',
              'transition-colors duration-150',
              styles.tab,
              isActive
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export { Tabs };
export type { TabsProps, Tab, TabSize };
