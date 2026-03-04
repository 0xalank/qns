'use client';

import { Suspense } from 'react';
import { AuctionFlow } from '@/components/AuctionFlow';

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Register a Name</h1>
      <Suspense fallback={<div className="bg-neutral-900 rounded-xl p-8 text-neutral-400">Loading...</div>}>
        <AuctionFlow />
      </Suspense>
    </div>
  );
}
