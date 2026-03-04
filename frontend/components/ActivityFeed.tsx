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
    <div className="bg-neutral-900 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">
        Recent Auctions
      </h2>
      {loading && auctions.length === 0 && (
        <p className="text-sm text-neutral-500">Loading...</p>
      )}
      {!loading && auctions.length === 0 && (
        <p className="text-sm text-neutral-500">No auctions yet. Be the first!</p>
      )}
      <div className="space-y-2">
        {auctions.map((a, i) => (
          <Link
            key={`${a.nameHash}-${i}`}
            href={`/${encodeURIComponent(a.name)}`}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <span className="font-medium text-white">{a.name}</span>
            <span className="text-xs text-neutral-500 font-mono">
              {truncateAddress(a.initiator, 4)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
