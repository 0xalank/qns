'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useUserNames } from '@/hooks/useQNNS';
import { ProfileForm } from '@/components/ProfileForm';
import * as qnns from '@/lib/qnns';
import { formatQuai, expiryStatusLabel, expiryBadgeColor, timeUntil } from '@/lib/utils';
import Link from 'next/link';

export default function MyNamesPage() {
  const router = useRouter();
  const { connected, address, signer, connect, pelagusInstalled } = useWallet();
  const userNames = useUserNames();

  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<qnns.FullNameData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadNames = useCallback(() => {
    if (address) {
      userNames.load(address);
    }
  }, [address, userNames.load]);

  useEffect(() => {
    if (connected && address) {
      loadNames();
    }
  }, [connected, address, loadNames]);

  const selectName = async (nameHash: string) => {
    setSelectedHash(nameHash);
    setLoadingDetail(true);
    try {
      const full = await qnns.getFullNameData(nameHash);
      setSelectedData(full);
    } catch {
      setSelectedData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleUpdate = () => {
    // Refresh both the list and the detail
    loadNames();
    if (selectedHash) {
      selectName(selectedHash);
    }
  };

  if (!pelagusInstalled) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-3">My Names</h1>
        <p className="text-neutral-400 mb-4">Install Pelagus wallet to manage your names.</p>
        <a href="https://pelaguswallet.io" target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-block transition-colors">
          Install Pelagus
        </a>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-3">My Names</h1>
        <p className="text-neutral-400 mb-4">Connect your wallet to manage your names.</p>
        <button onClick={connect} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (userNames.loading && userNames.names.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-400">Loading your names...</p>
      </div>
    );
  }

  if (!userNames.loading && userNames.names.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-3">No Names Registered</h1>
        <p className="text-neutral-400 mb-4">You don't own any QNNS names yet.</p>
        <button onClick={() => router.push('/register')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
          Register a Name
        </button>
      </div>
    );
  }

  // If editing a specific name
  if (selectedHash && selectedData && signer) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedHash(null); setSelectedData(null); }}
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              &larr; Back
            </button>
            <h1 className="text-2xl font-bold">Edit: {selectedData.name}</h1>
          </div>
          <Link
            href={`/${encodeURIComponent(selectedData.name)}`}
            className="text-sm text-blue-400 hover:underline"
          >
            View public profile
          </Link>
        </div>
        <ProfileForm nameHash={selectedHash} data={selectedData} signer={signer} onUpdate={handleUpdate} />
      </div>
    );
  }

  if (loadingDetail) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-400">Loading name details...</p>
      </div>
    );
  }

  // Name list view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Names</h1>
        <Link
          href="/register"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Register New
        </Link>
      </div>

      <div className="space-y-3">
        {userNames.names.map(({ nameHash, data }) => {
          const expiresAt = Number(data.expiresAt);
          return (
            <div
              key={nameHash}
              className="bg-neutral-900 rounded-xl p-4 flex items-center justify-between hover:bg-neutral-800/70 transition-colors cursor-pointer"
              onClick={() => selectName(nameHash)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{data.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${expiryBadgeColor(expiresAt)}`}>
                      {expiryStatusLabel(expiresAt)}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-neutral-500 mt-1">
                    {expiresAt > 0 && <span>Expires: {timeUntil(expiresAt)}</span>}
                    <span>Lock: {formatQuai(data.lockAmount)} QUAI</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/${encodeURIComponent(data.name)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-neutral-500 hover:text-blue-400 transition-colors"
                >
                  View
                </Link>
                <span className="text-neutral-600">&rarr;</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
