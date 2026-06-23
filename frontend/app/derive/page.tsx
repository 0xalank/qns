'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CopyButton } from '@/components/CopyButton';

function DeriveContent() {
  const searchParams = useSearchParams();
  const [paymentCode, setPaymentCode] = useState(searchParams.get('code') || '');
  const [mnemonic, setMnemonic] = useState('');
  const [addresses, setAddresses] = useState<Array<{ index: number; address: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derive = async () => {
    if (!paymentCode || !mnemonic) return;
    setLoading(true);
    setError(null);

    try {
      const results: Array<{ index: number; address: string }> = [];
      for (let i = 0; i < 5; i++) {
        const res = await fetch('/api/derive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderMnemonic: mnemonic.trim(),
            receiverPaymentCode: paymentCode.trim(),
            index: i,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        results.push({ index: i, address: data.derivedAddress });
      }
      setAddresses(results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reg-rise mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Derive addresses</h1>
        <p className="mt-3 max-w-xl leading-7 text-muted">
          Generate unique, unlinkable payment addresses from a Qi payment code using ECDH.
        </p>
      </header>

      <div className="reg-record p-6">
        <div className="space-y-4">
          <div>
            <label className="reg-label mb-1.5 block">Receiver&apos;s payment code</label>
            <input
              type="text"
              value={paymentCode}
              onChange={(e) => setPaymentCode(e.target.value)}
              placeholder="PM8T…"
              className="reg-input reg-input-mono"
            />
          </div>
          <div>
            <label className="reg-label mb-1.5 block">Your mnemonic (sender)</label>
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="Enter your 12-word mnemonic…"
              rows={2}
              className="reg-input reg-input-mono resize-none"
            />
            <p className="mt-1.5 flex items-center gap-2 text-xs text-warn">
              <span className="reg-stamp reg-stamp-warn">Testnet only</span>
              Processed server-side for ECDH derivation.
            </p>
          </div>
          <button onClick={derive} disabled={loading || !paymentCode || !mnemonic} className="reg-btn reg-btn-stamp">
            {loading ? 'Deriving…' : 'Derive addresses (0–4)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 border border-bad bg-[var(--bad-wash)] px-4 py-3 text-sm text-bad">{error}</div>
      )}

      {addresses.length > 0 && (
        <div className="reg-record reg-rise mt-5 p-6">
          <h2 className="reg-label mb-3">Derived addresses</h2>
          <div className="divide-y divide-line">
            {addresses.map((a) => (
              <div key={a.index} className="flex items-center gap-3 py-2.5">
                <span className="font-mono text-xs text-stamp">#{a.index}</span>
                <code className="flex-1 truncate font-mono text-sm text-good">{a.address}</code>
                <CopyButton text={a.address} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="reg-frame mt-5 p-6">
        <h2 className="reg-label mb-4">How ECDH derivation works</h2>
        <ol className="space-y-2 text-sm text-muted">
          {[
            "Parse the receiver's payment code to extract their public key.",
            'ECDH: shared_point = sender_privkey × receiver_pubkey.',
            'shared_secret = x-coordinate of shared_point.',
            'tweak = keccak256(shared_secret ‖ index).',
            'derived_pubkey = receiver_pubkey + tweak × G.',
            'address = last 20 bytes of keccak256(derived_pubkey).',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-xs text-stamp">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-mono text-[0.8rem] leading-6">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
          Each index produces a unique, unlinkable address. Only the receiver can spend from them.
        </p>
      </div>
    </div>
  );
}

export default function DerivePage() {
  return (
    <Suspense fallback={<div className="font-mono text-sm uppercase tracking-[0.16em] text-muted">Loading…</div>}>
      <DeriveContent />
    </Suspense>
  );
}
