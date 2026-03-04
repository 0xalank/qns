'use client';

import Link from 'next/link';
import { WalletConnect } from './WalletConnect';
import { useWallet } from '@/hooks/useWallet';

export function Navbar() {
  const { connected } = useWallet();

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-white hover:text-blue-400 transition-colors">
            QNNS
          </Link>
          <div className="hidden sm:flex items-center gap-4">
            <Link href="/register" className="text-sm text-neutral-400 hover:text-white transition-colors">
              Register
            </Link>
            <Link href="/derive" className="text-sm text-neutral-400 hover:text-white transition-colors">
              Derive
            </Link>
            {connected && (
              <Link href="/me" className="text-sm text-neutral-400 hover:text-white transition-colors">
                My Names
              </Link>
            )}
          </div>
        </div>
        <WalletConnect />
      </div>
    </nav>
  );
}
