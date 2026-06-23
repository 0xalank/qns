'use client';

import { useState } from 'react';

type SiteTab = 'lexi' | 'blog' | 'swap';

export function OnChainBrowser() {
  const [activeSite, setActiveSite] = useState<SiteTab>('lexi');

  return (
    <div className="space-y-6">
      <div>
        <p className="reg-kicker">Serverless & Unstoppable</p>
        <h2 className="mt-2 font-display text-3xl text-ink">Decentralized Web Browser</h2>
        <p className="mt-2 text-sm leading-6 text-muted max-w-xl">
          Traditional websites rely on hosting companies. QNS websites live directly in blockchain smart contract state. Click below to simulate visiting on-chain sites:
        </p>
      </div>

      {/* Mock Browser Container */}
      <div className="reg-record overflow-hidden border border-line-strong bg-paper shadow-lg">
        {/* Browser Top Bar */}
        <div className="flex flex-col gap-2 border-b border-line bg-paper-sunk p-3 sm:flex-row sm:items-center">
          {/* Window controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="h-3 w-3 rounded-full bg-bad/60" />
            <span className="h-3 w-3 rounded-full bg-warn/60" />
            <span className="h-3 w-3 rounded-full bg-good/60" />
          </div>

          {/* Browser Address Bar */}
          <div className="flex-1 flex items-center bg-paper border border-line px-3 py-1.5 font-mono text-xs text-ink rounded-sm shadow-inner sm:ml-4">
            <span className="text-good mr-1.5">🔒</span>
            <span className="text-muted mr-0.5">qns://</span>
            <span className="font-semibold text-ink">{activeSite}</span>
            <span className="text-blue">.quai</span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 shrink-0 sm:ml-4">
            {(['lexi', 'blog', 'swap'] as SiteTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSite(tab)}
                type="button"
                className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all ${
                  activeSite === tab
                    ? 'border-blue bg-blue-wash text-blue font-semibold'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {tab}.quai
              </button>
            ))}
          </div>
        </div>

        {/* Browser Content Window */}
        <div className="bg-paper-2 min-h-[300px] p-6 flex flex-col justify-between relative overflow-hidden">
          {/* Ambient matrix/grid overlay */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#2563EB_1px,transparent_1px)] [background-size:16px_16px]" />

          {activeSite === 'lexi' && (
            <div className="space-y-4 animate-fade-in relative z-10">
              <div className="flex items-center gap-4">
                <img
                  src="/lexi-avatar.png"
                  alt="Lexi"
                  className="h-16 w-16 object-cover border border-line shadow-sm"
                />
                <div>
                  <h3 className="font-display text-xl text-ink font-bold">Lexi Mercer</h3>
                  <p className="text-xs text-muted">UI Designer & Digital Artist · Austin, TX</p>
                </div>
              </div>
              <p className="text-xs leading-5 text-ink-soft max-w-md">
                "Hey! I'm Lexi, a digital artist and product designer. When I'm not designing interfaces, I'm usually out capturing landscape photography or experimenting with procedural shaders. I built this on-chain home to share my latest gallery releases directly from the blockchain."
              </p>
              <div className="flex gap-2">
                <span className="reg-stamp reg-stamp-mark font-mono">Twitter: @lexi_mercer</span>
                <span className="reg-stamp reg-stamp-mark font-mono">Nostr: npub1lexi...</span>
              </div>
            </div>
          )}

          {activeSite === 'blog' && (
            <div className="space-y-4 animate-fade-in relative z-10">
              <div className="border-b border-line pb-3">
                <span className="font-mono text-[9px] uppercase tracking-widest text-blue">Decentralized Press</span>
                <h3 className="font-display text-lg text-ink font-bold mt-1">The Future of Sovereign Web Hosting</h3>
                <p className="text-[10px] text-muted mt-0.5">Published Block: #1,248,392</p>
              </div>

              <div className="grid gap-6 md:grid-cols-[1fr_180px] items-start">
                <div className="space-y-3">
                  <p className="text-xs leading-5 text-ink-soft">
                    Smart contract storage is historically expensive. But with Quai Network's multi-thread architecture, we can deploy complete compressed static frontends directly into contract bytecode.
                  </p>
                  <p className="text-xs leading-5 text-ink-soft">
                    When a browser resolves `blog.quai`, it reads the raw assembly, verifies the cryptographic hash, and renders the content locally. The author owns 100% of their words.
                  </p>
                </div>

                {/* Landscape Mountain Image (3:2 Aspect Ratio) */}
                <div className="w-full aspect-[3/2] overflow-hidden border border-line bg-white shadow-sm p-1">
                  <img
                    src="/qns-blog-header.png"
                    alt="Mountain Landscape"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSite === 'swap' && (
            <div className="max-w-md mx-auto animate-fade-in relative z-10 w-full">
              <div className="space-y-4 border border-line bg-paper p-4 rounded-none shadow-inner w-full">
                <div className="flex justify-between items-center border-b border-line pb-2">
                  <span className="font-display text-sm text-ink font-semibold">QNS swap</span>
                  <span className="text-[10px] text-good font-mono bg-good-wash px-1.5 py-0.5">CONNECTED</span>
                </div>
                <div className="space-y-2">
                  <div className="bg-paper-sunk p-2.5 border border-line flex justify-between items-center">
                    <span className="font-mono text-xs text-muted">Pay</span>
                    <span className="font-display text-base font-bold text-ink">10.0 QUAI</span>
                  </div>
                  <div className="bg-paper-sunk p-2.5 border border-line flex justify-between items-center">
                    <span className="font-mono text-xs text-muted">Receive</span>
                    <span className="font-display text-base font-bold text-ink">52.8 QI</span>
                  </div>
                </div>
                <button type="button" className="w-full reg-btn reg-btn-stamp text-xs py-2 font-mono">
                  Execute Swap
                </button>
              </div>
            </div>
          )}

          {/* Browser Footer Metadata */}
          <div className="mt-8 border-t border-line pt-3 flex flex-wrap justify-between items-center text-[10px] font-mono text-muted">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-good animate-pulse" />
              <span>Status: Resolved Directly from Blockchain state</span>
            </div>
            <span>Module size: 2.4 KB (100% on-chain)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
