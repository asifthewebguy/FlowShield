'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Analytics', href: '#analytics' },
  { label: 'Pricing', href: '#pricing' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    setTimeout(() => toggleRef.current?.focus(), 0);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileOpen, closeMobile]);

  // Focus trap for mobile menu
  useEffect(() => {
    if (!mobileOpen) return;
    const menu = menuRef.current;
    if (!menu) return;

    const focusable = menu.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [mobileOpen]);

  return (
    <nav aria-label="Main navigation" className="fixed top-0 w-full z-50 bg-surface-1/80 backdrop-blur-lg border-b border-surface-3">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-xl font-display font-bold text-white">
            Flow<span className="text-primary-500">Shield</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            ref={toggleRef}
            className="md:hidden text-gray-400 hover:text-white p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div ref={menuRef} className="md:hidden bg-surface-1 border-b border-surface-3 px-4 pb-4" role="menu">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={closeMobile}
              className="block py-2 text-gray-400 hover:text-white transition-colors"
              role="menuitem"
            >
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 mt-4">
            <Link
              href="/auth/login"
              onClick={closeMobile}
              className="py-2 text-center text-gray-300 border border-gray-700 rounded-lg hover:border-primary-700 transition-colors"
              role="menuitem"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              onClick={closeMobile}
              className="py-2 text-center bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
              role="menuitem"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
