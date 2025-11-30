'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  const isActive = (path: string) => {
    return pathname === path;
  };

  const linkClassName = (path: string) => {
    if (isActive(path)) {
      return 'text-primary-600 font-semibold';
    }
    return 'text-gray-600 dark:text-gray-400 hover:text-primary-600';
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-600">Shield</span>
          </h1>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className={linkClassName('/dashboard')}>
              Dashboard
            </Link>
            <Link href="/analytics" className={linkClassName('/analytics')}>
              Analytics
            </Link>
            <Link href="/activity" className={linkClassName('/activity')}>
              Activity
            </Link>
            <Link href="/profile" className={linkClassName('/profile')}>
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
