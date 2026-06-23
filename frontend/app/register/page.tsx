'use client';

import { Suspense } from 'react';
import { AuctionFlow } from '@/components/AuctionFlow';

export default function RegisterPage() {
  return (
    <div className="reg-rise mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Claim a name</h1>
        <p className="mt-3 max-w-xl leading-7 text-muted">
          Names with 7+ characters register instantly. Shorter names use a 24-hour English auction with a 30-minute anti-snipe window.
        </p>
      </header>
      <Suspense
        fallback={
          <div className="reg-record p-8 font-mono text-sm uppercase tracking-[0.16em] text-muted">
            Loading…
          </div>
        }
      >
        <AuctionFlow />
      </Suspense>
    </div>
  );
}
