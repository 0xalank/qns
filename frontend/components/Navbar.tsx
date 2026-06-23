'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from './WalletConnect';
import { useWallet } from '@/hooks/useWallet';

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`font-mono text-xs uppercase tracking-[0.18em] transition-colors ${
        active ? 'text-ink' : 'text-muted hover:text-stamp'
      }`}
    >
      {label}
    </Link>
  );
}

export function Navbar() {
  const { connected } = useWallet();

  return (
    <nav className="sticky top-0 z-50 border-b border-line-strong bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-9">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink font-display text-base font-semibold text-ink transition-transform duration-200 group-hover:-rotate-6">
              Q
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-semibold text-ink">QNS</span>
              <span className="reg-label !text-[0.55rem] !tracking-[0.22em]">Registry</span>
            </span>
          </Link>
          <div className="hidden items-center gap-7 sm:flex">
            <NavLink href="/register" label="Register" />
            <NavLink href="/modules" label="Developers" />
            {connected && <NavLink href="/me" label="My Names" />}
          </div>
        </div>
        <WalletConnect />
      </div>
    </nav>
  );
}
