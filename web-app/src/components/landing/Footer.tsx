const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Analytics', href: '#analytics' },
    { label: 'AI Coach', href: '#coach' },
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

export default function Footer() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="text-xl font-bold text-white">
              Flow<span className="text-primary-600">Shield</span>
            </a>
            <p className="mt-3 text-sm text-gray-500">
              AI-powered productivity & focus management platform.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-gray-300 mb-3">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 text-center text-sm text-gray-600">
          &copy; {new Date().getFullYear()} FlowShield. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
