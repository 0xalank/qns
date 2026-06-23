'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useRegistration } from '@/hooks/useRegistration';
import { usePricing } from '@/hooks/useQNNS';
import { nameValidationError, formatQuai, timeUntil } from '@/lib/utils';
import { parseQuai } from 'quais';
import Link from 'next/link';

function getRegistrationTier(name: string): { tier: string; description: string } {
  const len = name.length;
  if (len >= 7) {
    return { tier: 'Instant', description: `${len} chars · instant for a 200 QUAI fee` };
  }
  if (len >= 4) {
    return { tier: 'Auction', description: `${len} chars · 24-hour auction, 1,000 QUAI minimum bid` };
  }
  return { tier: 'Premium auction', description: `${len} chars · 24-hour auction, 5,000 QUAI minimum bid` };
}

function Shell({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return <div className={`reg-record reg-rise p-8 ${center ? 'text-center' : ''}`}>{children}</div>;
}

function CostRow({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return (
    <div className={`flex justify-between ${total ? 'border-t border-line pt-2 font-semibold text-ink' : 'text-muted'}`}>
      <span>{label}</span>
      <span className={total ? 'text-ink' : 'font-mono text-ink-soft'}>{value}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="reg-label mb-1.5 block">{children}</label>;
}

export function AuctionFlow() {
  const { connected, signer, address, connect, pelagusInstalled } = useWallet();
  const pricing = usePricing();
  const searchParams = useSearchParams();

  const initialName = (searchParams.get('name') || '').toLowerCase().trim();
  const [nameInput, setNameInput] = useState(initialName);
  const [submittedName, setSubmittedName] = useState(initialName);
  const draftName = nameInput.toLowerCase().trim();
  const targetName = submittedName;
  const nameErr = draftName ? nameValidationError(draftName) : null;
  const searchedNameIsCurrent = !!targetName && targetName === draftName && !nameErr;

  const registration = useRegistration(signer, address, targetName || null);
  const registrationMatchesSearch = searchedNameIsCurrent && registration.name === targetName;
  const searchPending = searchedNameIsCurrent && (!registrationMatchesSearch || registration.step === 'loading');
  const [bidInput, setBidInput] = useState('');
  const [quaiAddr, setQuaiAddr] = useState('');
  const [qiCode, setQiCode] = useState('');
  const [yearlyFee, setYearlyFee] = useState<bigint | null>(null);

  const handleNameSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName || nameErr) return;
    setSubmittedName(draftName);
  };

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
    if (searchedNameIsCurrent && pricing.auctionFloor1to3 && pricing.auctionFloor4to6) {
      const floor = pricing.getAuctionFloor(targetName.length);
      if (floor) {
        setBidInput(formatQuai(floor));
      }
    }
  }, [searchedNameIsCurrent, targetName, pricing.auctionFloor1to3, pricing.auctionFloor4to6, pricing.getAuctionFloor]);

  useEffect(() => {
    let mounted = true;
    setYearlyFee(null);

    if (!searchedNameIsCurrent) {
      return;
    }

    pricing.getYearlyPrice(targetName.length)
      .then((fee) => {
        if (mounted) setYearlyFee(fee);
      })
      .catch(() => {
        if (mounted) setYearlyFee(null);
      });

    return () => {
      mounted = false;
    };
  }, [searchedNameIsCurrent, targetName, pricing.getYearlyPrice]);

  if (!pelagusInstalled) {
    return (
      <Shell center>
        <h2 className="font-display text-2xl text-ink">Wallet required</h2>
        <p className="mb-5 mt-2 text-muted">Install Pelagus to record a name on Quai.</p>
        <a href="https://pelaguswallet.io" target="_blank" rel="noopener noreferrer" className="reg-btn reg-btn-stamp">
          Install Pelagus
        </a>
      </Shell>
    );
  }

  if (!connected) {
    return (
      <Shell center>
        <h2 className="font-display text-2xl text-ink">Connect your wallet</h2>
        <p className="mb-5 mt-2 text-muted">Connect Pelagus to claim and sign for a name.</p>
        <button onClick={connect} className="reg-btn reg-btn-ink">Connect Wallet</button>
      </Shell>
    );
  }

  // Loading state
  if (searchPending) {
    return (
      <Shell center>
        <p className="font-mono text-sm uppercase tracking-[0.16em] text-muted">
          Checking <span className="font-display text-base normal-case tracking-normal text-ink">{targetName}</span>…
        </p>
      </Shell>
    );
  }

  // Done state
  if (registrationMatchesSearch && registration.step === 'done') {
    if (registration.error === 'This name is already registered') {
      return (
        <Shell center>
          <span className="reg-stamp reg-stamp-bad reg-stamped">Taken</span>
          <h2 className="mt-5 font-display text-2xl text-ink">Name already taken</h2>
          <p className="mb-5 mt-2 text-muted">
            <span className="font-display text-ink">{targetName}.quai</span> is already registered.
          </p>
          <Link href={`/${encodeURIComponent(targetName)}`} className="reg-btn reg-btn-ink">View profile</Link>
        </Shell>
      );
    }

    return (
      <Shell center>
        <span className="reg-stamp reg-stamp-mark reg-stamped">Registered</span>
        <h2 className="mt-5 font-display text-3xl text-ink">{registration.name || targetName}.quai is yours</h2>
        <p className="mt-2 text-muted">It&apos;s now bound to your wallet.</p>
        {registration.txHash && (
          <p className="mx-auto mt-3 max-w-md break-all font-mono text-xs text-faint">Tx · {registration.txHash}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/${encodeURIComponent(registration.name)}`} className="reg-btn reg-btn-stamp">View profile</Link>
          <Link href="/me" className="reg-btn reg-btn-ghost">My domains</Link>
          <button
            onClick={() => {
              setNameInput('');
              setSubmittedName('');
              registration.reset();
            }}
            className="reg-btn reg-btn-ghost"
          >
            Register another
          </button>
        </div>
      </Shell>
    );
  }

  // Error state
  if (registrationMatchesSearch && registration.step === 'error') {
    return (
      <Shell>
        <h2 className="font-display text-2xl text-bad">Registration failed</h2>
        <p className="mb-5 mt-2 text-muted">{registration.error}</p>
        <button onClick={registration.reset} className="reg-btn reg-btn-ghost">Try again</button>
      </Shell>
    );
  }

  // Finalize auction — auction ended, winner finalizes
  if (registrationMatchesSearch && (registration.step === 'ended' || registration.step === 'finalizing')) {
    const isWinner = registration.isWinner;
    return (
      <Shell>
        <p className="reg-kicker">Auction settled</p>
        <h2 className="mt-2 font-display text-2xl text-ink">{registration.name}.quai</h2>
        {registration.auction && (
          <p className="mt-1 text-muted">
            Winning bid <span className="font-mono text-ink">{formatQuai(registration.auction.highestBid)} QUAI</span>
            {' '}by <span className="font-mono text-sm text-ink">{registration.auction.highestBidder.slice(0, 10)}…</span>
          </p>
        )}

        {isWinner ? (
          <div className="mt-5">
            <span className="reg-stamp reg-stamp-good reg-stamped">You won</span>
            <div className="my-5 space-y-4">
              <div>
                <FieldLabel>Quai Address</FieldLabel>
                <input type="text" value={quaiAddr} onChange={(e) => setQuaiAddr(e.target.value)} className="reg-input reg-input-mono" />
              </div>
              <div>
                <FieldLabel>Qi Payment Code (optional)</FieldLabel>
                <input type="text" value={qiCode} onChange={(e) => setQiCode(e.target.value)} placeholder="PM8T…" className="reg-input reg-input-mono" />
              </div>
            </div>
            <p className="mb-4 text-sm text-muted">
              Finalizing requires the lock deposit + first-year fee.
              {pricing.minLock && <> Minimum lock: {formatQuai(pricing.minLock)} QUAI.</>}
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
                className="reg-btn reg-btn-stamp"
              >
                {registration.step === 'finalizing' ? 'Finalizing…' : 'Finalize & claim'}
              </button>
              <button onClick={registration.refreshAuction} className="reg-btn reg-btn-ghost">Refresh</button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <span className="reg-stamp reg-stamp-warn reg-stamped">Outbid</span>
            <p className="my-4 text-muted">You did not win this auction.</p>
            <button onClick={registration.reset} className="reg-btn reg-btn-ghost">Register another name</button>
          </div>
        )}

        {registration.error && <p className="mt-3 text-sm text-bad">{registration.error}</p>}
      </Shell>
    );
  }

  // Active auction — countdown + bidding
  if (registrationMatchesSearch && (registration.step === 'active' || registration.step === 'bidding')) {
    return (
      <Shell>
        <p className="reg-kicker">Auction in progress</p>
        <h2 className="mt-2 font-display text-2xl text-ink">{registration.name}.quai</h2>
        {registration.auction && (
          <p className="mt-1 text-muted">
            Current bid <span className="font-mono text-ink">{formatQuai(registration.auction.highestBid)} QUAI</span>
            {' '}by <span className="font-mono text-sm text-ink">{registration.auction.highestBidder.slice(0, 10)}…</span>
          </p>
        )}

        <div className="my-6 border border-line-strong bg-paper-sunk p-5 text-center">
          <p className="reg-label">Time remaining</p>
          <span className="mt-1 block font-mono text-4xl font-semibold tabular-nums text-stamp">
            {registration.auction ? timeUntil(registration.auction.endTime) : `${registration.secondsLeft}s`}
          </span>
        </div>

        <div className="mb-4">
          <FieldLabel>Your bid (QUAI)</FieldLabel>
          <div className="flex gap-2">
            <input type="text" value={bidInput} onChange={(e) => setBidInput(e.target.value)} placeholder="Amount in QUAI" className="reg-input flex-1" />
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
              className="reg-btn reg-btn-stamp"
            >
              {registration.step === 'bidding' ? 'Bidding…' : 'Place bid'}
            </button>
          </div>
          {registration.auction && (
            <p className="mt-1.5 font-mono text-xs text-muted">
              Must exceed {formatQuai(registration.auction.highestBid)} QUAI
            </p>
          )}
        </div>

        <button onClick={registration.refreshAuction} className="reg-btn reg-btn-ghost text-sm">Refresh</button>
        {registration.error && <p className="mt-3 text-sm text-bad">{registration.error}</p>}
      </Shell>
    );
  }

  // Starting auction state
  if (registrationMatchesSearch && registration.step === 'starting') {
    return (
      <Shell center>
        <p className="font-mono text-sm uppercase tracking-[0.16em] text-muted">
          Opening auction for <span className="font-display text-base normal-case tracking-normal text-ink">{registration.name}</span>…
        </p>
        <p className="mt-2 text-sm text-faint">Confirm the transaction in your wallet.</p>
      </Shell>
    );
  }

  // Registering state (instant registration)
  if (registrationMatchesSearch && registration.step === 'registering') {
    return (
      <Shell center>
        <p className="font-mono text-sm uppercase tracking-[0.16em] text-muted">
          Registering <span className="font-display text-base normal-case tracking-normal text-ink">{registration.name}</span>…
        </p>
        <p className="mt-2 text-sm text-faint">Confirm the transaction in your wallet.</p>
      </Shell>
    );
  }

  // Idle — show appropriate form based on name length
  const tierInfo = draftName && !nameErr ? getRegistrationTier(draftName) : null;
  const previewIsInstant = draftName.length >= 7;
  const isInstant = registrationMatchesSearch && registration.registrationType === 'instant';

  return (
    <div className="reg-record reg-rise p-8">
      <form onSubmit={handleNameSearch} className="mb-5">
        <FieldLabel>Name</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-baseline border border-line-strong bg-paper-sunk px-4 focus-within:border-stamp">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="yoursite"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent py-3 font-display text-2xl text-ink outline-none placeholder:text-faint"
            />
            <span className="font-display text-xl text-muted">.quai</span>
          </div>
          <button
            type="submit"
            disabled={!draftName || !!nameErr || searchPending}
            className="reg-btn reg-btn-stamp min-h-[3.25rem] px-6"
          >
            Search
          </button>
        </div>
        {nameErr && <p className="mt-1.5 font-mono text-xs text-bad">✕ {nameErr}</p>}
        {tierInfo && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <span className={`reg-stamp ${previewIsInstant ? 'reg-stamp-good' : 'reg-stamp-warn'}`}>{tierInfo.tier}</span>
            <span>{tierInfo.description}</span>
          </p>
        )}
        {draftName && !nameErr && !searchedNameIsCurrent && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Press Search to check this name.
          </p>
        )}
      </form>

      {/* Instant Registration (7+ chars) */}
      {isInstant && targetName && !nameErr && (
        <div>
          <div className="mb-5 border border-line bg-paper-sunk p-4">
            <p className="reg-label mb-3">Cost</p>
            <div className="space-y-1.5 text-sm">
              <CostRow label="Registration fee" value={`${pricing.registrationFee7Plus ? formatQuai(pricing.registrationFee7Plus) : '200'} QUAI`} />
              <CostRow label="Lock deposit (refundable)" value={`${pricing.minLock ? formatQuai(pricing.minLock) : '100'} QUAI`} />
              <CostRow label="First-year fee" value={yearlyFee ? `${formatQuai(yearlyFee)} QUAI` : 'Loading'} />
              <CostRow
                total
                label="Total"
                value={pricing.registrationFee7Plus && pricing.minLock && yearlyFee
                  ? `${formatQuai(pricing.registrationFee7Plus + pricing.minLock + yearlyFee)} QUAI`
                  : 'Loading'}
              />
            </div>
          </div>

          <div className="mb-5 space-y-4">
            <div>
              <FieldLabel>Quai Address</FieldLabel>
              <input type="text" value={quaiAddr} onChange={(e) => setQuaiAddr(e.target.value)} className="reg-input reg-input-mono" />
            </div>
            <div>
              <FieldLabel>Qi Payment Code (optional)</FieldLabel>
              <input type="text" value={qiCode} onChange={(e) => setQiCode(e.target.value)} placeholder="PM8T…" className="reg-input reg-input-mono" />
            </div>
          </div>

          <button
            onClick={async () => {
              try {
                const { getYearlyPriceQuaiByLength } = await import('@/lib/qnns');
                const liveYearlyFee = yearlyFee || await getYearlyPriceQuaiByLength(targetName.length);
                const regFee = pricing.registrationFee7Plus || parseQuai('200');
                const lock = pricing.minLock || parseQuai('100');
                const total = regFee + lock + liveYearlyFee;
                await registration.registerInstant(targetName, quaiAddr, qiCode, total);
              } catch {
                // Error handling
              }
            }}
            disabled={!quaiAddr || !targetName}
            className="reg-btn reg-btn-stamp w-full py-3.5 text-base"
          >
            Register
          </button>
        </div>
      )}

      {/* Auction (1-6 chars) */}
      {registrationMatchesSearch && !isInstant && targetName && !nameErr && (
        <div>
          <div className="mb-5 border border-line bg-paper-sunk p-4">
            <p className="reg-label mb-3">Auction terms</p>
            <div className="space-y-1.5 text-sm">
              <CostRow
                label="Minimum bid"
                value={`${pricing.getAuctionFloor(targetName.length)
                  ? formatQuai(pricing.getAuctionFloor(targetName.length)!)
                  : (targetName.length <= 3 ? '5,000' : '1,000')} QUAI`}
              />
              <CostRow label="Duration" value="24 hours" />
              <CostRow label="Anti-snipe window" value="30 minutes" />
            </div>
          </div>

          <div className="mb-5">
            <FieldLabel>Opening bid (QUAI)</FieldLabel>
            <input
              type="text"
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder={pricing.getAuctionFloor(targetName.length)
                ? formatQuai(pricing.getAuctionFloor(targetName.length)!)
                : (targetName.length <= 3 ? '5000' : '1000')}
              className="reg-input"
            />
            <p className="mt-1.5 font-mono text-xs text-muted">
              Minimum {pricing.getAuctionFloor(targetName.length)
                ? formatQuai(pricing.getAuctionFloor(targetName.length)!)
                : (targetName.length <= 3 ? '5,000' : '1,000')} QUAI
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
            className="reg-btn reg-btn-stamp w-full py-3.5 text-base"
          >
            Open auction
          </button>

          <div className="reg-masthead mt-6 pt-5">
            <p className="reg-label mb-3">How auctions work</p>
            <ol className="space-y-2 text-sm text-muted">
              {[
                'Open an auction with your opening bid.',
                'Others bid during the 24-hour window.',
                'Any bid in the final 30 minutes extends the clock.',
                'The winner finalizes by paying the lock deposit + first-year fee.',
                'Renew yearly to keep the entry active.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-xs text-stamp">{String(i + 1).padStart(2, '0')}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* No name entered yet */}
      {!draftName && (
        <div className="reg-masthead mt-2 pt-5">
          <p className="reg-label mb-3">How names are priced</p>
          <dl className="divide-y divide-line">
            {[
              ['7+ characters', 'Instant · 200 QUAI flat fee', 'reg-stamp-good'],
              ['4–6 characters', '24-hour auction · 1,000 QUAI minimum', 'reg-stamp-warn'],
              ['1–3 characters', '24-hour auction · 5,000 QUAI minimum', 'reg-stamp-bad'],
            ].map(([len, detail, cls]) => (
              <div key={len} className="flex items-center justify-between gap-3 py-3">
                <span className={`reg-stamp ${cls}`}>{len}</span>
                <span className="text-right text-sm text-muted">{detail}</span>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
