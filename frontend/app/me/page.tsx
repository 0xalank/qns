'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useUserNames } from '@/hooks/useQNNS';
import { ProfileForm } from '@/components/ProfileForm';
import * as qnns from '@/lib/qnns';
import { formatQuai, expiryStatusLabel, expiryBadgeColor, timeUntil } from '@/lib/utils';
import Link from 'next/link';

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="reg-rise mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-4xl text-ink">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

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
    loadNames();
    if (selectedHash) {
      selectName(selectedHash);
    }
  };

  if (!pelagusInstalled) {
    return (
      <Gate title="Wallet required">
        <p className="mb-5 text-muted">Install Pelagus to manage the names you hold.</p>
        <a href="https://pelaguswallet.io" target="_blank" rel="noopener noreferrer" className="reg-btn reg-btn-stamp">
          Install Pelagus
        </a>
      </Gate>
    );
  }

  if (!connected) {
    return (
      <Gate title="Connect your wallet">
        <p className="mb-5 text-muted">Connect Pelagus to see the names bound to your wallet.</p>
        <button onClick={connect} className="reg-btn reg-btn-ink">Connect Wallet</button>
      </Gate>
    );
  }

  if (userNames.loading && userNames.names.length === 0) {
    return (
      <Gate title="My names">
        <p className="font-mono text-sm uppercase tracking-[0.16em] text-muted">Loading…</p>
      </Gate>
    );
  }

  if (!userNames.loading && userNames.names.length === 0) {
    return (
      <Gate title="No entries yet">
        <p className="mb-5 text-muted">You don&apos;t hold any .quai names. Claim your first to start a record.</p>
        <button onClick={() => router.push('/register')} className="reg-btn reg-btn-stamp">Register a name →</button>
      </Gate>
    );
  }

  // Editing a specific name
  if (selectedHash && selectedData && signer) {
    return (
      <div className="reg-rise mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setSelectedHash(null); setSelectedData(null); }}
              className="font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-stamp"
            >
              ← Back
            </button>
            <h1 className="font-display text-2xl text-ink">{selectedData.name}.quai</h1>
          </div>
          <Link href={`/${encodeURIComponent(selectedData.name)}`} className="font-mono text-xs uppercase tracking-[0.14em] text-stamp hover:underline">
            View public entry →
          </Link>
        </div>
        <ProfileForm nameHash={selectedHash} data={selectedData} signer={signer} onUpdate={handleUpdate} />
      </div>
    );
  }

  if (loadingDetail) {
    return (
      <Gate title="My names">
        <p className="font-mono text-sm uppercase tracking-[0.16em] text-muted">Loading…</p>
      </Gate>
    );
  }

  // Name list view
  return (
    <div className="reg-rise mx-auto max-w-3xl">
      <div className="mb-7 flex items-end justify-between">
        <h1 className="font-display text-4xl text-ink">My names</h1>
        <Link href="/register" className="reg-btn reg-btn-ink text-sm">Register new</Link>
      </div>

      <div className="reg-record divide-y divide-line">
        {userNames.names.map(({ nameHash, data }) => {
          const expiresAt = Number(data.expiresAt);
          return (
            <div
              key={nameHash}
              className="group flex cursor-pointer items-center justify-between gap-4 p-5 transition-colors hover:bg-paper-sunk"
              onClick={() => selectName(nameHash)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl text-ink">{data.name}<span className="text-muted">.quai</span></span>
                  <span className={expiryBadgeColor(expiresAt)}>{expiryStatusLabel(expiresAt)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted">
                  {expiresAt > 0 && <span>Expires in {timeUntil(expiresAt)}</span>}
                  <span>Lock {formatQuai(data.lockAmount)} QUAI</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <Link
                  href={`/${encodeURIComponent(data.name)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono text-xs uppercase tracking-[0.14em] text-muted transition-colors hover:text-stamp"
                >
                  View
                </Link>
                <span className="text-faint transition-transform group-hover:translate-x-1">→</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
