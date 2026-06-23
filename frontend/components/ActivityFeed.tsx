'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRecentActivity } from '@/hooks/useQNNS';
import { truncateAddress } from '@/lib/utils';

export function ActivityFeed() {
  const { auctions, loading, fetch } = useRecentActivity();

  useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <div className="reg-record p-5">
      <h2 className="reg-label mb-3">Recent auctions</h2>
      {loading && auctions.length === 0 && (
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Reading the register…</p>
      )}
      {!loading && auctions.length === 0 && (
        <p className="text-sm text-muted">No auctions yet. Be the first to open one.</p>
      )}
      <div className="divide-y divide-line">
        {auctions.map((a, i) => (
          <Link
            key={`${a.nameHash}-${i}`}
            href={`/${encodeURIComponent(a.name)}`}
            className="group flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-stamp"
          >
            <span className="font-display text-base text-ink group-hover:text-stamp">{a.name}<span className="text-muted">.quai</span></span>
            <span className="font-mono text-xs text-muted">{truncateAddress(a.initiator, 4)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
