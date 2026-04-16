'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { removeToken, removeUserData } from '@/lib/auth-token';
import {
  LayoutDashboard,
  BarChart3,
  Activity,
  FileBarChart,
  DollarSign,
  Users,
  Sparkles,
  UserCircle,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onMobileClose?: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sessions', label: 'Sessions', icon: History },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/reports/weekly', label: 'Reports', icon: FileBarChart },
  { href: '/projects/cost', label: 'Project Cost', icon: DollarSign },
  { href: '/community', label: 'Community', icon: Users },
  { href: '/coach', label: 'Coach', icon: Sparkles },
  { href: '/profile', label: 'Profile', icon: UserCircle },
];

export default function Sidebar({ collapsed, onToggle, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNavClick = () => {
    onMobileClose?.();
  };

  const handleLogout = () => {
    removeToken();
    removeUserData();
    onMobileClose?.();
    router.push('/');
  };

  return (
    <aside
      className={[
        'flex flex-col h-full relative',
        'bg-white dark:bg-surface-1',
        'border-r border-gray-200/60 dark:border-white/[0.04]',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      {/* Depth gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none dark:bg-gradient-to-b dark:from-white/[0.02] dark:via-transparent dark:to-black/[0.1]"
        aria-hidden="true"
      />

      {/* Subtle right-edge highlight */}
      <div
        className="absolute top-0 right-0 w-px h-full pointer-events-none dark:bg-gradient-to-b dark:from-white/[0.06] dark:via-white/[0.02] dark:to-transparent"
        aria-hidden="true"
      />

      {/* Logo */}
      <div className={[
        'relative flex items-center h-16 shrink-0',
        'border-b border-gray-200/60 dark:border-white/[0.04]',
        collapsed ? 'justify-center px-0' : 'px-5',
      ].join(' ')}>
        <Link
          href="/dashboard"
          onClick={handleNavClick}
          className="flex items-center gap-0 select-none"
        >
          {collapsed ? (
            <span className="text-lg font-bold tracking-tight">
              <span className="text-gray-900 dark:text-white">F</span>
              <span className="text-primary-500">S</span>
            </span>
          ) : (
            <span className="text-xl font-bold tracking-tight">
              <span className="text-gray-900 dark:text-white">Flow</span>
              <span className="text-primary-500">Shield</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              title={collapsed ? item.label : undefined}
              className={[
                'group relative flex items-center rounded-lg',
                'transition-all duration-150 ease-out',
                collapsed ? 'justify-center h-10 w-full' : 'h-10 px-3 gap-3',
                isActive
                  ? 'bg-primary-50 dark:bg-primary-500/[0.08] text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.04] hover:text-gray-900 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {/* Active indicator — the glowing accent line */}
              {isActive && (
                <span
                  className={[
                    'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full',
                    'bg-primary-500',
                    'shadow-[0_0_8px_rgba(14,165,233,0.4)]',
                  ].join(' ')}
                  aria-hidden="true"
                />
              )}

              <Icon
                size={20}
                strokeWidth={isActive ? 2 : 1.75}
                className={[
                  'shrink-0 transition-colors duration-150',
                  collapsed ? '' : '',
                ].join(' ')}
              />

              {!collapsed && (
                <span className="text-sm font-medium truncate">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="relative shrink-0 p-2 border-t border-gray-200/60 dark:border-white/[0.04] space-y-1">
        <button
          onClick={handleLogout}
          title={collapsed ? 'Log out' : undefined}
          aria-label="Log out"
          className={[
            'flex items-center rounded-lg w-full',
            'text-gray-500 dark:text-gray-500',
            'hover:bg-red-50 dark:hover:bg-red-500/[0.08]',
            'hover:text-red-600 dark:hover:text-red-400',
            'transition-all duration-150 ease-out',
            'h-9',
            collapsed ? 'justify-center' : 'px-3 gap-3',
          ].join(' ')}
        >
          <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Log out</span>}
        </button>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={[
            'flex items-center rounded-lg w-full',
            'text-gray-400 dark:text-gray-600',
            'hover:bg-gray-100 dark:hover:bg-white/[0.04]',
            'hover:text-gray-600 dark:hover:text-gray-400',
            'transition-all duration-150 ease-out',
            'h-9',
            collapsed ? 'justify-center' : 'px-3 gap-3',
          ].join(' ')}
        >
          {collapsed ? (
            <PanelLeft size={18} strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose size={18} strokeWidth={1.75} />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
