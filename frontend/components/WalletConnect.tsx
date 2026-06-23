'use client';

import { useWallet } from '@/hooks/useWallet';
import { truncateAddress } from '@/lib/utils';

export function WalletConnect() {
  const { connected, address, connecting, error, pelagusInstalled, connect, disconnect } = useWallet();

  if (!pelagusInstalled) {
    return (
      <a
        href="https://pelaguswallet.io"
        target="_blank"
        rel="noopener noreferrer"
        className="reg-btn reg-btn-stamp"
      >
        Install Pelagus
      </a>
    );
  }

  if (connected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 border border-line-strong bg-paper-2 px-3 py-1.5 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          <span className="font-mono text-xs text-ink">{truncateAddress(address)}</span>
        </span>
        <button
          onClick={disconnect}
          className="font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-stamp"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={connect} disabled={connecting} className="reg-btn reg-btn-ink">
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {error && <span className="font-mono text-xs text-bad">{error}</span>}
    </div>
  );
}
