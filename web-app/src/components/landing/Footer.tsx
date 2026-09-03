import Link from 'next/link';

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Analytics', href: '#analytics' },
    { label: 'Pricing', href: '#pricing' },
  ],
  Platforms: [
    { label: 'Web Dashboard', href: '/auth/signup' },
    { label: 'Desktop App (Windows)', href: '/auth/signup' },
    { label: 'Browser Extension', href: '/auth/signup' },
    { label: 'Mobile App', href: '/auth/signup' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith('#')) {
    return (
      <a href={href} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
      {children}
    </Link>
  );
}

export default function Footer() {
  return (
    <footer className="bg-surface-0 border-t border-surface-3">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-xl font-display font-bold text-white">
              Flow<span className="text-primary-500">Shield</span>
            </Link>
            <p className="mt-3 text-sm text-gray-500">
              Focus sessions, automatic activity tracking, and distraction blocking.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-gray-300 mb-3">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <FooterLink href={link.href}>{link.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-surface-3 text-center text-sm text-gray-600">
          &copy; {new Date().getFullYear()} FlowShield. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
