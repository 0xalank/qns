'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from './WalletConnect';
import { useWallet } from '@/hooks/useWallet';
import { useTheme } from '@/hooks/useTheme';

const linkBase = 'font-mono text-xs uppercase tracking-[0.18em] transition-colors';

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} className={`${linkBase} ${active ? 'text-ink' : 'text-muted hover:text-stamp'}`}>
      {label}
    </Link>
  );
}

const docsItems = [
  { href: '/docs', label: 'Overview', sub: 'What QNS is and how it fits together' },
  { href: '/docs/modules', label: 'How modules work', sub: 'Anchors, manifests, and the loader' },
  { href: '/docs/deploy', label: 'Deploy a module', sub: 'Publish an on-chain site from the CLI' },
  { href: '/modules', label: 'Module inspector', sub: 'Read what a name loads on-chain' },
];

function DocsMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = pathname.startsWith('/docs') || pathname === '/modules';

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        href="/docs"
        onClick={() => setOpen(false)}
        className={`${linkBase} flex items-center gap-1.5 ${active ? 'text-ink' : 'text-muted hover:text-stamp'}`}
      >
        Docs
        <span className={`text-[0.6rem] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>▾</span>
      </Link>

      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
          <div className="reg-record w-72 p-2">
            {docsItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 transition-colors hover:bg-paper-sunk"
              >
                <span className="font-display text-sm text-ink">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">{item.sub}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { connected } = useWallet();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 border-b border-line-strong bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-9">
          <Link href="/" className="group flex items-center gap-2 text-ink">
            <svg viewBox="0 0 100 100" fill="none" className="h-10 w-10 transition-transform duration-200 group-hover:-rotate-1">
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.3"/>
              <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>

              <line x1="50" y1="2" x2="50" y2="6" stroke="#2563EB" strokeWidth="2"/>
              <line x1="50" y1="94" x2="50" y2="98" stroke="#2563EB" strokeWidth="2"/>
              <line x1="2" y1="50" x2="6" y2="50" stroke="#2563EB" strokeWidth="2"/>
              <line x1="94" y1="50" x2="98" y2="50" stroke="#2563EB" strokeWidth="2"/>

              <polygon points="50,22 80,78 20,78" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>

              <line x1="50" y1="22" x2="50" y2="78" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <line x1="50" y1="55" x2="20" y2="78" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="50" y1="55" x2="80" y2="78" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="50" y1="22" x2="35" y2="78" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" opacity="0.5"/>
              <line x1="50" y1="22" x2="65" y2="78" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" opacity="0.5"/>

              <polygon points="50,22 62.5,45 50,38 37.5,45" fill="#2563EB" stroke="#2563EB" strokeWidth="2" strokeLinejoin="round" opacity="0.9"/>
            </svg>
            <span className="font-display font-bold tracking-wider text-sm">QNS</span>
          </Link>
          <div className="hidden items-center gap-7 sm:flex">
            <NavLink href="/register" label="Register" />
            <NavLink href="/ecosystem" label="Ecosystem" />
            <DocsMenu />
            {connected && <NavLink href="/me" label="My Names" />}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            type="button"
            className="flex h-9 w-9 items-center justify-center text-muted hover:text-blue transition-colors focus:outline-none"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg className="h-4.5 w-4.5 text-ink-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="h-4.5 w-4.5 text-blue-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            )}
          </button>
          <WalletConnect />
        </div>
      </div>
    </nav>
  );
}
