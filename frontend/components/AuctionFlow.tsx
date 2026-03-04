'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useRegistration } from '@/hooks/useRegistration';
import { usePricing } from '@/hooks/useQNNS';
import { nameValidationError, isValidName, formatQuai, timeUntil } from '@/lib/utils';
import { parseQuai } from 'quais';
import Link from 'next/link';

function getRegistrationTier(name: string): { tier: string; description: string } {
  const len = name.length;
  if (len >= 7) {
    return { tier: 'Instant', description: `${len} chars - instant registration with 200 QUAI fee` };
  }
  if (len >= 4) {
    return { tier: 'Auction (4-6 chars)', description: `${len} chars - 24-hour auction with 1,000 QUAI minimum bid` };
  }
  return { tier: 'Premium Auction (1-3 chars)', description: `${len} chars - 24-hour auction with 5,000 QUAI minimum bid` };
}

export function AuctionFlow() {
  const { connected, signer, address, connect, pelagusInstalled } = useWallet();
  const pricing = usePricing();
  const searchParams = useSearchParams();

  const [nameInput, setNameInput] = useState(searchParams.get('name') || '');
  const targetName = nameInput.toLowerCase().trim();

  const registration = useRegistration(signer, address, targetName || null);
  const [bidInput, setBidInput] = useState('');
  const [quaiAddr, setQuaiAddr] = useState('');
  const [qiCode, setQiCode] = useState('');

  useEffect(() => {
    if (connected) {
      pricing.load();
    }
  }, [connected, pricing.load]);

  // Auto-fill quai address from wallet
  useEffect(() => {
    if (address && !quaiAddr) {
      setQuaiAddr(address);
    }
  }, [address, quaiAddr]);

  // Set default bid based on name length
  useEffect(() => {
    if (targetName && pricing.auctionFloor1to3 && pricing.auctionFloor4to6) {
      const floor = pricing.getAuctionFloor(targetName.length);
      if (floor) {
        setBidInput(formatQuai(floor));
      }
    }
  }, [targetName, pricing]);

  if (!pelagusInstalled) {
    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <h2 className="text-xl font-bold mb-3">Wallet Required</h2>
        <p className="text-neutral-400 mb-4">Install Pelagus wallet to register a name.</p>
        <a
          href="https://pelaguswallet.io"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-block transition-colors"
        >
          Install Pelagus
        </a>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <h2 className="text-xl font-bold mb-3">Connect Wallet</h2>
        <p className="text-neutral-400 mb-4">Connect your Pelagus wallet to register a name.</p>
        <button
          onClick={connect}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  // Loading state
  if (registration.step === 'loading' && targetName) {
    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <p className="text-neutral-400">Checking <span className="font-bold text-white">{targetName}</span>...</p>
      </div>
    );
  }

  // Done state
  if (registration.step === 'done') {
    if (registration.error === 'This name is already registered') {
      return (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Name Already Taken</h2>
          <p className="text-neutral-400 mb-4">
            <span className="font-bold text-white">{targetName}</span> is already registered.
          </p>
          <Link
            href={`/${encodeURIComponent(targetName)}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            View Profile
          </Link>
        </div>
      );
    }

    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-xl font-bold mb-2">Name Registered!</h2>
        <p className="text-neutral-400 mb-1">
          <span className="font-bold text-white">{registration.name || targetName}</span> is now yours.
        </p>
        {registration.txHash && (
          <p className="text-xs text-neutral-500 font-mono mb-6 break-all">Tx: {registration.txHash}</p>
        )}
        <div className="flex gap-3 justify-center">
          <Link
            href={`/${encodeURIComponent(registration.name)}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            View Profile
          </Link>
          <Link
            href="/me"
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            My Names
          </Link>
          <button
            onClick={registration.reset}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-lg transition-colors"
          >
            Register Another
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (registration.step === 'error') {
    return (
      <div className="bg-neutral-900 rounded-xl p-8">
        <h2 className="text-xl font-bold mb-3 text-red-400">Registration Failed</h2>
        <p className="text-neutral-400 mb-4">{registration.error}</p>
        <button
          onClick={registration.reset}
          className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Finalize auction — auction ended, winner finalizes
  if (registration.step === 'ended' || registration.step === 'finalizing') {
    const isWinner = registration.isWinner;
    return (
      <div className="bg-neutral-900 rounded-xl p-8">
        <h2 className="text-xl font-bold mb-2">Auction Ended</h2>
        <p className="text-neutral-400 mb-1">
          Name: <span className="font-bold text-white">{registration.name}</span>
        </p>
        {registration.auction && (
          <p className="text-neutral-400 mb-4">
            Winning bid: <span className="text-white font-bold">{formatQuai(registration.auction.highestBid)} QUAI</span>
            {' '}by <span className="text-white font-mono text-sm">{registration.auction.highestBidder.slice(0, 10)}...</span>
          </p>
        )}

        {isWinner ? (
          <div>
            <p className="text-green-400 mb-4">You won! Finalize to claim your name.</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Quai Address</label>
                <input
                  type="text"
                  value={quaiAddr}
                  onChange={(e) => setQuaiAddr(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Qi Payment Code (optional)</label>
                <input
                  type="text"
                  value={qiCode}
                  onChange={(e) => setQiCode(e.target.value)}
                  placeholder="PM8T..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500 mb-4">
              Finalization requires paying the lock deposit + first year fee.
              {pricing.minLock && <> Min lock: {formatQuai(pricing.minLock)} QUAI.</>}
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const { getYearlyPriceQuaiByLength } = await import('@/lib/qnns');
                  const yearlyFee = await getYearlyPriceQuaiByLength(registration.name.length);
                  const lock = pricing.minLock || BigInt(0);
                  const total = lock + yearlyFee;
                  await registration.finalize(quaiAddr, qiCode, total);
                }}
                disabled={registration.step === 'finalizing' || !quaiAddr}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg transition-colors"
              >
                {registration.step === 'finalizing' ? 'Finalizing...' : 'Finalize & Claim'}
              </button>
              <button
                onClick={registration.refreshAuction}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-yellow-400 mb-4">You did not win this auction.</p>
            <button
              onClick={registration.reset}
              className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Register Another Name
            </button>
          </div>
        )}

        {registration.error && (
          <p className="text-red-400 text-sm mt-3">{registration.error}</p>
        )}
      </div>
    );
  }

  // Active auction — countdown + bidding
  if (registration.step === 'active' || registration.step === 'bidding') {
    return (
      <div className="bg-neutral-900 rounded-xl p-8">
        <h2 className="text-xl font-bold mb-2">Auction In Progress</h2>
        <p className="text-neutral-400 mb-1">
          Name: <span className="font-bold text-white">{registration.name}</span>
        </p>
        {registration.auction && (
          <p className="text-neutral-400 mb-2">
            Current bid: <span className="text-white font-bold">{formatQuai(registration.auction.highestBid)} QUAI</span>
            {' '}by <span className="text-white font-mono text-sm">{registration.auction.highestBidder.slice(0, 10)}...</span>
          </p>
        )}

        <div className="bg-neutral-800 rounded-lg p-4 text-center mb-6">
          <p className="text-xs text-neutral-500 uppercase mb-1">Time Remaining</p>
          <span className="text-3xl font-mono font-bold text-blue-400">
            {registration.auction ? timeUntil(registration.auction.endTime) : `${registration.secondsLeft}s`}
          </span>
        </div>

        <div className="mb-4">
          <label className="text-xs text-neutral-500 mb-1 block">Your Bid (QUAI)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder="Amount in QUAI"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                try {
                  const amount = parseQuai(bidInput);
                  registration.placeBid(amount);
                } catch {
                  // Invalid amount
                }
              }}
              disabled={registration.step === 'bidding' || !bidInput}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {registration.step === 'bidding' ? 'Bidding...' : 'Place Bid'}
            </button>
          </div>
          {registration.auction && (
            <p className="text-xs text-neutral-500 mt-1">
              Must exceed current bid of {formatQuai(registration.auction.highestBid)} QUAI
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={registration.refreshAuction}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-lg transition-colors text-sm"
          >
            Refresh
          </button>
        </div>

        {registration.error && (
          <p className="text-red-400 text-sm mt-3">{registration.error}</p>
        )}
      </div>
    );
  }

  // Starting auction state
  if (registration.step === 'starting') {
    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <p className="text-neutral-400">Starting auction for <span className="font-bold text-white">{registration.name}</span>...</p>
        <p className="text-sm text-neutral-500 mt-2">Confirm the transaction in your wallet.</p>
      </div>
    );
  }

  // Registering state (instant registration)
  if (registration.step === 'registering') {
    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <p className="text-neutral-400">Registering <span className="font-bold text-white">{registration.name}</span>...</p>
        <p className="text-sm text-neutral-500 mt-2">Confirm the transaction in your wallet.</p>
      </div>
    );
  }

  // Idle — show appropriate form based on name length
  const nameErr = targetName ? nameValidationError(targetName) : null;
  const tierInfo = targetName && !nameErr ? getRegistrationTier(targetName) : null;
  const isInstant = registration.registrationType === 'instant';

  return (
    <div className="bg-neutral-900 rounded-xl p-8">
      <h2 className="text-xl font-bold mb-2">Register a Name</h2>
      <p className="text-neutral-400 mb-6">
        {isInstant || !targetName
          ? 'Names with 7+ characters can be registered instantly. Shorter names require an auction.'
          : 'Short names (1-6 characters) are registered through a 24-hour auction.'
        }
      </p>

      <div className="mb-4">
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Enter a name..."
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        {nameErr && <p className="text-sm text-red-400 mt-1">{nameErr}</p>}
        {tierInfo && (
          <p className="text-sm text-neutral-500 mt-1">
            <span className={`font-semibold ${isInstant ? 'text-green-400' : 'text-yellow-400'}`}>{tierInfo.tier}</span>
            {' '}&mdash; {tierInfo.description}
          </p>
        )}
      </div>

      {/* Instant Registration (7+ chars) */}
      {isInstant && targetName && !nameErr && (
        <div>
          <div className="bg-neutral-800 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-neutral-300 mb-2">Registration Cost</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Registration Fee:</span>
                <span className="text-white">{pricing.registrationFee7Plus ? formatQuai(pricing.registrationFee7Plus) : '200'} QUAI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Lock Deposit (refundable):</span>
                <span className="text-white">{pricing.minLock ? formatQuai(pricing.minLock) : '100'} QUAI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">First Year Fee:</span>
                <span className="text-white">~5 QUAI</span>
              </div>
              <div className="border-t border-neutral-700 pt-1 mt-1">
                <div className="flex justify-between font-semibold">
                  <span className="text-neutral-300">Total:</span>
                  <span className="text-white">~{pricing.registrationFee7Plus && pricing.minLock
                    ? formatQuai(pricing.registrationFee7Plus + pricing.minLock + BigInt(5e18))
                    : '305'} QUAI</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Quai Address</label>
              <input
                type="text"
                value={quaiAddr}
                onChange={(e) => setQuaiAddr(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Qi Payment Code (optional)</label>
              <input
                type="text"
                value={qiCode}
                onChange={(e) => setQiCode(e.target.value)}
                placeholder="PM8T..."
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            onClick={async () => {
              try {
                const { getYearlyPriceQuaiByLength } = await import('@/lib/qnns');
                const yearlyFee = await getYearlyPriceQuaiByLength(targetName.length);
                const regFee = pricing.registrationFee7Plus || BigInt(200e18);
                const lock = pricing.minLock || BigInt(100e18);
                const total = regFee + lock + yearlyFee;
                await registration.registerInstant(targetName, quaiAddr, qiCode, total);
              } catch {
                // Error handling
              }
            }}
            disabled={!quaiAddr || !targetName}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors font-semibold"
          >
            Register Now
          </button>
        </div>
      )}

      {/* Auction (1-6 chars) */}
      {!isInstant && targetName && !nameErr && (
        <div>
          <div className="bg-neutral-800 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-neutral-300 mb-2">Auction Details</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Minimum Bid:</span>
                <span className="text-white font-semibold">
                  {pricing.getAuctionFloor(targetName.length)
                    ? formatQuai(pricing.getAuctionFloor(targetName.length)!)
                    : (targetName.length <= 3 ? '5,000' : '1,000')
                  } QUAI
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Duration:</span>
                <span className="text-white">24 hours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Anti-snipe window:</span>
                <span className="text-white">30 minutes</span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-neutral-500 mb-1 block">Opening Bid (QUAI)</label>
            <input
              type="text"
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder={pricing.getAuctionFloor(targetName.length)
                ? formatQuai(pricing.getAuctionFloor(targetName.length)!)
                : (targetName.length <= 3 ? '5000' : '1000')
              }
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Minimum bid: {pricing.getAuctionFloor(targetName.length)
                ? formatQuai(pricing.getAuctionFloor(targetName.length)!)
                : (targetName.length <= 3 ? '5,000' : '1,000')
              } QUAI
            </p>
          </div>

          <button
            onClick={() => {
              try {
                const amount = parseQuai(bidInput);
                registration.startAuction(targetName, amount);
              } catch {
                // Invalid amount
              }
            }}
            disabled={!targetName || !bidInput}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors font-semibold"
          >
            Start Auction
          </button>

          <div className="mt-6 p-4 bg-neutral-800 rounded-lg">
            <h3 className="text-sm font-semibold text-neutral-300 mb-2">How auctions work</h3>
            <ol className="text-sm text-neutral-400 space-y-1 list-decimal list-inside">
              <li>Start an auction with your opening bid</li>
              <li>Others can bid during the 24-hour auction window</li>
              <li>Any bid in the last 30 minutes extends the auction</li>
              <li>Winner finalizes by paying lock deposit + first year fee</li>
              <li>Name renews yearly — keep it active or let it expire</li>
            </ol>
          </div>
        </div>
      )}

      {/* No name entered yet */}
      {!targetName && (
        <div className="mt-4 p-4 bg-neutral-800 rounded-lg">
          <h3 className="text-sm font-semibold text-neutral-300 mb-2">Registration Types</h3>
          <div className="text-sm text-neutral-400 space-y-2">
            <div>
              <span className="text-green-400 font-semibold">7+ characters:</span> Instant registration with 200 QUAI flat fee
            </div>
            <div>
              <span className="text-yellow-400 font-semibold">4-6 characters:</span> 24-hour auction with 1,000 QUAI minimum
            </div>
            <div>
              <span className="text-orange-400 font-semibold">1-3 characters:</span> 24-hour auction with 5,000 QUAI minimum
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
