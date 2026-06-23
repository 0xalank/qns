'use client';

import { useState, useEffect } from 'react';
import * as qnns from '@/lib/qnns';
import { truncateAddress } from '@/lib/utils';

interface ResolutionPreviewProps {
  name: string;
}

function getHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function ProceduralAvatar({ name, size = 64 }: { name: string; size?: number }) {
  const hash = getHash(name || 'qns');
  const hue1 = hash % 360;
  const hue2 = (hash + 120) % 360;
  const shapeType = hash % 3;
  const color1 = `hsl(${hue1}, 85%, 60%)`;
  const color2 = `hsl(${hue2}, 90%, 45%)`;
  const bg = `hsl(${(hash + 240) % 360}, 20%, 15%)`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="rounded-none border border-line-strong shadow-inner">
      <rect width="100" height="100" fill={bg} />
      {shapeType === 0 ? (
        <>
          <circle cx="50" cy="50" r="35" fill={color1} opacity="0.85" />
          <circle cx="50" cy="50" r="20" fill={color2} opacity="0.9" />
          <rect x="42" y="42" width="16" height="16" fill="#fff" transform="rotate(45 50 50)" />
        </>
      ) : shapeType === 1 ? (
        <>
          <polygon points="50,15 85,75 15,75" fill={color1} opacity="0.85" />
          <polygon points="50,30 70,70 30,70" fill={color2} opacity="0.9" />
          <circle cx="50" cy="58" r="8" fill="#fff" />
        </>
      ) : (
        <>
          <rect x="15" y="15" width="30" height="30" fill={color1} opacity="0.8" />
          <rect x="55" y="15" width="30" height="30" fill={color2} opacity="0.9" />
          <rect x="15" y="55" width="30" height="30" fill={color2} opacity="0.85" />
          <rect x="55" y="55" width="30" height="30" fill={color1} opacity="0.95" />
          <circle cx="50" cy="50" r="12" fill="#fff" stroke={bg} strokeWidth="3" />
        </>
      )}
      <line x1="5" y1="50" x2="15" y2="50" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
      <line x1="85" y1="50" x2="95" y2="50" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
      <line x1="50" y1="5" x2="50" y2="15" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
      <line x1="50" y1="85" x2="50" y2="95" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

export function ResolutionPreview({ name }: ResolutionPreviewProps) {
  const activeName = name.toLowerCase().trim();
  const displayName = activeName || 'yourname';

  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [data, setData] = useState<qnns.FullNameData | null>(null);

  const hash = getHash(displayName);
  const simAddress = `0x00` + hash.toString(16).padEnd(8, 'f') + `...` + (hash * 3).toString(16).slice(0, 4);
  const simPaymentCode = `PM8T` + hash.toString(10).padEnd(10, '0') + `qiNetworkCode`;
  const simNostr = `npub1` + hash.toString(16).padEnd(12, 'a') + `nostrkey`;

  useEffect(() => {
    if (!activeName) {
      setRegistered(false);
      setData(null);
      return;
    }

    let isMounted = true;
    const fetchOnChainData = async () => {
      setLoading(true);
      try {
        const nameHash = qnns.hashNameLocal(activeName);
        const isReg = await qnns.isAvailable(activeName); // Note: isAvailable returns true if NOT registered
        const regStatus = !isReg;
        if (!isMounted) return;

        setRegistered(regStatus);
        if (regStatus) {
          const full = await qnns.getFullNameData(nameHash);
          if (isMounted) setData(full);
        } else {
          if (isMounted) setData(null);
        }
      } catch (e) {
        console.error('Failed to fetch resolver data:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timeout = setTimeout(fetchOnChainData, 400);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [activeName]);

  if (!activeName || (!registered && !loading)) {
    return null;
  }

  const displayAddress = registered && data?.quaiAddress ? data.quaiAddress : simAddress;
  const displayPaymentCode = registered && data?.qiPaymentCode ? data.qiPaymentCode : simPaymentCode;
  const displayNostr = registered && data?.nostrPubkey ? data.nostrPubkey : simNostr;
  const hasModule = registered && data?.contentHash && data.contentHash !== '0x' && data.contentHash !== '0x0000000000000000000000000000000000000000000000000000000000000000';

  return (
    <div className="reg-record overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-paper-sunk px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${loading ? 'bg-blue animate-pulse' : registered ? 'bg-warn' : 'bg-good'}`} />
          <span className="font-mono uppercase tracking-wider text-muted">
            {loading ? 'Resolving chain...' : registered ? 'On-Chain Record (Active)' : 'Previewing Draft (Available)'}
          </span>
        </div>
        <span className="font-mono text-faint">QNS v2.0</span>
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <ProceduralAvatar name={activeName} size={84} />
            <div className="text-center">
              <div className="font-display text-lg text-ink font-semibold">
                {displayName}
                <span className="text-blue">.quai</span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {registered ? 'Registered NFT' : 'Claimable'}
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-4 font-mono text-xs w-full overflow-hidden">
            <div className="border border-line bg-paper-2 p-3 relative group">
              <div className="absolute top-[-7px] left-3 bg-paper px-2 text-[9px] uppercase tracking-wider text-muted">
                Quai Address (EV)
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-ink font-semibold truncate max-w-[180px] sm:max-w-md">
                  {displayAddress}
                </span>
                <span className="text-[10px] text-blue-bright uppercase bg-blue-wash px-1.5 py-0.5 font-medium shrink-0">
                  {registered ? 'RESOLVED' : 'SIMULATION'}
                </span>
              </div>
            </div>

            <div className="border border-line bg-paper-2 p-3 relative">
              <div className="absolute top-[-7px] left-3 bg-paper px-2 text-[9px] uppercase tracking-wider text-muted">
                Qi Payment Code (BIP47)
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-ink truncate max-w-[180px] sm:max-w-md">
                  {displayPaymentCode}
                </span>
                <span className="text-[10px] text-blue-bright uppercase bg-blue-wash px-1.5 py-0.5 font-medium shrink-0">
                  {registered ? 'BIP47' : 'SIMULATED'}
                </span>
              </div>
            </div>

            <div className="border border-line bg-paper-2 p-3 relative">
              <div className="absolute top-[-7px] left-3 bg-paper px-2 text-[9px] uppercase tracking-wider text-muted">
                Nostr Pubkey (NIP-05)
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-ink truncate max-w-[180px] sm:max-w-md">
                  {displayNostr}
                </span>
                <span className="text-[10px] text-blue-bright uppercase bg-blue-wash px-1.5 py-0.5 font-medium shrink-0">
                  {registered ? 'NIP-05' : 'SIMULATED'}
                </span>
              </div>
            </div>

            <div className="border border-line bg-paper-2 p-3 relative">
              <div className="absolute top-[-7px] left-3 bg-paper px-2 text-[9px] uppercase tracking-wider text-muted">
                On-Chain Web Module
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-ink-soft truncate max-w-[180px] sm:max-w-md">
                  {hasModule ? `Static Site: ${truncateAddress(data?.contentHash || '', 8)}` : 'No web module anchored'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 font-medium shrink-0 ${hasModule ? 'text-good bg-good-wash' : 'text-muted bg-paper-sunk'}`}>
                  {hasModule ? 'WEBSITE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-1 bg-gradient-to-r from-blue/20 via-blue-bright/60 to-blue/20" />
    </div>
  );
}
