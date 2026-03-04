'use client';

import { SearchBar } from '@/components/SearchBar';
import { ActivityFeed } from '@/components/ActivityFeed';
import Link from 'next/link';

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold mb-3">Quai Name Service</h1>
        <p className="text-neutral-400 text-lg mb-8 max-w-lg mx-auto">
          Register a name on Quai Network. Link your address, payment code, avatar, and social profiles.
        </p>
        <div className="max-w-xl mx-auto">
          <SearchBar />
        </div>
        <div className="mt-6 flex gap-4 justify-center">
          <Link
            href="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-colors"
          >
            Register a Name
          </Link>
          <Link
            href="/derive"
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-6 py-2.5 rounded-lg transition-colors"
          >
            Derive Addresses
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        <div className="bg-neutral-900 rounded-xl p-5">
          <h3 className="font-semibold mb-1">Hybrid Registration</h3>
          <p className="text-sm text-neutral-400">7+ char names: instant 200 QUAI. Shorter names: 24-hour auctions with tiered minimums.</p>
        </div>
        <div className="bg-neutral-900 rounded-xl p-5">
          <h3 className="font-semibold mb-1">Yearly Renewable</h3>
          <p className="text-sm text-neutral-400">Names renew annually with tiered pricing based on length. 30-day grace period on expiry.</p>
        </div>
        <div className="bg-neutral-900 rounded-xl p-5">
          <h3 className="font-semibold mb-1">Qi Payment Codes</h3>
          <p className="text-sm text-neutral-400">Link a BIP47 payment code for private Qi UTXO payments.</p>
        </div>
      </div>

      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  );
}
