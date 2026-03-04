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
    <div>
      <h1 className="text-2xl font-bold mb-2">Derive Addresses</h1>
      <p className="text-neutral-400 mb-6">
        Generate unique payment addresses from a Qi payment code using ECDH.
      </p>

      <div className="bg-neutral-900 rounded-xl p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-neutral-400 mb-1 block">Receiver's Payment Code</label>
            <input
              type="text"
              value={paymentCode}
              onChange={(e) => setPaymentCode(e.target.value)}
              placeholder="PM8T..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400 mb-1 block">Your Mnemonic (sender)</label>
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="Enter your 12-word mnemonic..."
              rows={2}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm placeholder-neutral-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            <p className="text-xs text-yellow-500 mt-1">
              Mnemonic is processed server-side for ECDH derivation. Use testnet mnemonics only.
            </p>
          </div>
          <button
            onClick={derive}
            disabled={loading || !paymentCode || !mnemonic}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg transition-colors"
          >
            {loading ? 'Deriving...' : 'Derive Addresses (0-4)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {addresses.length > 0 && (
        <div className="bg-neutral-900 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">
            Derived Addresses
          </h2>
          <div className="space-y-2">
            {addresses.map((a) => (
              <div key={a.index} className="flex items-center gap-3 bg-neutral-800 rounded-lg px-4 py-2.5">
                <span className="text-xs text-neutral-500 w-8">#{a.index}</span>
                <code className="flex-1 text-sm font-mono text-green-400 truncate">
                  {a.address}
                </code>
                <CopyButton text={a.address} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-neutral-900 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">How ECDH Derivation Works</h2>
        <ol className="text-sm text-neutral-400 space-y-1.5 list-decimal list-inside">
          <li>Parse receiver's payment code to extract their public key</li>
          <li>ECDH: shared_point = sender_privkey * receiver_pubkey</li>
          <li>shared_secret = x-coordinate of shared_point</li>
          <li>tweak = keccak256(shared_secret || index)</li>
          <li>derived_pubkey = receiver_pubkey + tweak * G</li>
          <li>address = last 20 bytes of keccak256(derived_pubkey)</li>
        </ol>
        <p className="text-sm text-yellow-400 mt-3">
          Each index produces a unique, unlinkable address. Only the receiver can spend from these addresses.
        </p>
      </div>
    </div>
  );
}

export default function DerivePage() {
  return (
    <Suspense fallback={<div className="text-neutral-400">Loading...</div>}>
      <DeriveContent />
    </Suspense>
  );
}
