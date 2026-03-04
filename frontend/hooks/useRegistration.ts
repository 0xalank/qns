'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Signer } from 'quais';
import * as qnns from '@/lib/qnns';

type RegistrationStep =
  | 'loading'
  | 'idle'
  | 'registering'       // Instant registration in progress
  | 'starting'          // Starting auction
  | 'active'            // Auction active
  | 'bidding'           // Placing bid
  | 'ended'             // Auction ended, waiting for finalization
  | 'finalizing'        // Finalizing auction
  | 'done'
  | 'error';

export type RegistrationType = 'instant' | 'auction' | null;

interface RegistrationState {
  step: RegistrationStep;
  name: string;
  registrationType: RegistrationType;
  auctionId: bigint | null;
  auction: qnns.AuctionData | null;
  secondsLeft: number;
  txHash: string | null;
  error: string | null;
}

export function useRegistration(signer: Signer | null, address: string | null, targetName: string | null) {
  const [state, setState] = useState<RegistrationState>({
    step: 'loading',
    name: targetName || '',
    registrationType: null,
    auctionId: null,
    auction: null,
    secondsLeft: 0,
    txHash: null,
    error: null,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef<string | null>(null);

  // Determine registration type based on name length
  const getRegistrationType = (name: string): RegistrationType => {
    if (!name) return null;
    return name.length >= 7 ? 'instant' : 'auction';
  };

  // Look up existing auction or determine registration type on mount/name change
  useEffect(() => {
    if (!targetName || initializedRef.current === targetName) return;
    initializedRef.current = targetName;

    // Capture targetName as a non-null value for the async function
    const name = targetName;

    async function initialize() {
      setState(prev => ({
        ...prev,
        step: 'loading',
        name,
        registrationType: getRegistrationType(name),
        auctionId: null,
        auction: null,
      }));

      try {
        // Check if name is already registered
        const available = await qnns.isAvailable(name);
        if (!available) {
          // Name is taken - check if there's an active auction or it's already owned
          const nameHash = qnns.hashNameLocal(name);
          const registered = await qnns.isRegistered(nameHash);
          if (registered) {
            setState(prev => ({ ...prev, step: 'done', error: 'This name is already registered' }));
            return;
          }
        }

        // Check if name is reserved or blocked
        const [reserved, blocked] = await Promise.all([
          qnns.isReserved(name),
          qnns.isBlocked(name),
        ]);

        if (blocked) {
          setState(prev => ({ ...prev, step: 'error', error: 'This name is blocked and cannot be registered' }));
          return;
        }

        if (reserved) {
          setState(prev => ({ ...prev, step: 'error', error: 'This name is reserved by the admin' }));
          return;
        }

        const regType = getRegistrationType(name);

        // For instant registration (7+ chars), we're ready to register
        if (regType === 'instant') {
          setState(prev => ({ ...prev, step: 'idle', registrationType: 'instant' }));
          return;
        }

        // For auction (1-6 chars), check for existing auction
        const recentAuctions = await qnns.getRecentAuctions(100);
        const matchingAuction = recentAuctions.find(a => a.name.toLowerCase() === name.toLowerCase());

        if (matchingAuction) {
          const auction = await qnns.getAuction(matchingAuction.auctionId);
          const now = Math.floor(Date.now() / 1000);

          if (auction.finalized) {
            setState(prev => ({ ...prev, step: 'done', registrationType: 'auction' }));
          } else if (auction.endTime <= now) {
            setState(prev => ({
              ...prev,
              step: 'ended',
              registrationType: 'auction',
              auctionId: matchingAuction.auctionId,
              auction,
              secondsLeft: 0,
            }));
          } else {
            setState(prev => ({
              ...prev,
              step: 'active',
              registrationType: 'auction',
              auctionId: matchingAuction.auctionId,
              auction,
              secondsLeft: Math.max(0, auction.endTime - now),
            }));
          }
        } else {
          setState(prev => ({ ...prev, step: 'idle', registrationType: 'auction' }));
        }
      } catch (e: any) {
        setState(prev => ({ ...prev, step: 'idle', error: e.message }));
      }
    }

    initialize();
  }, [targetName]);

  // Countdown timer for active auctions
  useEffect(() => {
    if (state.step !== 'active' || state.secondsLeft <= 0) {
      if (state.step === 'active' && state.secondsLeft <= 0) {
        setState(prev => ({ ...prev, step: 'ended' }));
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setState(prev => {
        const auction = prev.auction;
        const endTime = auction ? auction.endTime : 0;
        const now = Math.floor(Date.now() / 1000);
        const left = Math.max(0, endTime - now);
        if (left === 0) {
          return { ...prev, secondsLeft: 0, step: 'ended' };
        }
        return { ...prev, secondsLeft: left };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.step, state.secondsLeft]);

  // Instant registration for 7+ char names
  const registerInstant = useCallback(async (
    name: string,
    quaiAddress: string,
    qiPaymentCode: string,
    payment: bigint
  ) => {
    if (!signer) return;
    setState(prev => ({ ...prev, step: 'registering', name, error: null }));

    try {
      const receipt = await qnns.register(signer, name, quaiAddress, qiPaymentCode, payment);
      setState(prev => ({
        ...prev,
        step: 'done',
        txHash: receipt?.hash || null,
      }));
    } catch (e: any) {
      setState(prev => ({ ...prev, step: 'error', error: e.message }));
    }
  }, [signer]);

  // Start auction for 1-6 char names
  const startAuction = useCallback(async (name: string, bidAmount: bigint) => {
    if (!signer) return;
    setState(prev => ({ ...prev, step: 'starting', name, error: null }));

    try {
      const receipt = await qnns.startAuction(signer, name, bidAmount);

      // Parse AuctionStarted event from receipt
      const iface = new (await import('quais')).Interface(
        (await import('@/lib/constants')).QNNS_ABI
      );
      let auctionId: bigint | null = null;

      for (const log of (receipt?.logs || [])) {
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === 'AuctionStarted') {
            auctionId = parsed.args[0];
            break;
          }
        } catch { /* skip */ }
      }

      if (!auctionId) {
        throw new Error('Failed to parse auction ID from transaction');
      }

      const auction = await qnns.getAuction(auctionId);
      const now = Math.floor(Date.now() / 1000);

      setState(prev => ({
        ...prev,
        step: 'active',
        auctionId,
        auction,
        secondsLeft: Math.max(0, auction.endTime - now),
        txHash: receipt?.hash || null,
      }));
    } catch (e: any) {
      setState(prev => ({ ...prev, step: 'error', error: e.message }));
    }
  }, [signer]);

  // Place a bid on an active auction
  const placeBid = useCallback(async (amount: bigint) => {
    if (!signer || !state.auctionId) return;
    setState(prev => ({ ...prev, step: 'bidding', error: null }));

    try {
      await qnns.bid(signer, state.auctionId, amount);
      const auction = await qnns.getAuction(state.auctionId);
      const now = Math.floor(Date.now() / 1000);

      setState(prev => ({
        ...prev,
        step: auction.endTime > now ? 'active' : 'ended',
        auction,
        secondsLeft: Math.max(0, auction.endTime - now),
      }));
    } catch (e: any) {
      setState(prev => ({ ...prev, step: 'active', error: e.message }));
    }
  }, [signer, state.auctionId]);

  // Finalize auction to claim the name
  const finalize = useCallback(async (quaiAddress: string, qiPaymentCode: string, payment: bigint) => {
    if (!signer || !state.auctionId) return;
    setState(prev => ({ ...prev, step: 'finalizing', error: null }));

    try {
      const receipt = await qnns.finalizeAuction(signer, state.auctionId, quaiAddress, qiPaymentCode, payment);
      setState(prev => ({
        ...prev,
        step: 'done',
        txHash: receipt?.hash || null,
      }));
    } catch (e: any) {
      setState(prev => ({ ...prev, step: 'ended', error: e.message }));
    }
  }, [signer, state.auctionId]);

  // Refresh auction data
  const refreshAuction = useCallback(async () => {
    if (!state.auctionId) return;
    try {
      const auction = await qnns.getAuction(state.auctionId);
      const now = Math.floor(Date.now() / 1000);
      setState(prev => ({
        ...prev,
        auction,
        secondsLeft: Math.max(0, auction.endTime - now),
        step: auction.finalized ? 'done' : (auction.endTime <= now ? 'ended' : prev.step),
      }));
    } catch { /* ignore */ }
  }, [state.auctionId]);

  // Reset to idle state
  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    initializedRef.current = null;
    setState({
      step: 'idle',
      name: targetName || '',
      registrationType: targetName ? getRegistrationType(targetName) : null,
      auctionId: null,
      auction: null,
      secondsLeft: 0,
      txHash: null,
      error: null,
    });
  }, [targetName]);

  return {
    ...state,
    registerInstant,
    startAuction,
    placeBid,
    finalize,
    refreshAuction,
    reset,
    isWinner: state.auction && address ? state.auction.highestBidder.toLowerCase() === address.toLowerCase() : false,
  };
}
