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
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
      >
        Install Pelagus
      </a>
    );
  }

  if (connected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-neutral-300 bg-neutral-800 px-3 py-1.5 rounded-lg">
          {truncateAddress(address)}
        </span>
        <button
          onClick={disconnect}
          className="text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={connect}
        disabled={connecting}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
