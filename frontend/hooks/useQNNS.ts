'use client';

import { useState, useCallback } from 'react';
import * as qnns from '@/lib/qnns';

export function useNameLookup() {
  const [data, setData] = useState<qnns.FullNameData | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setOwner(null);
    try {
      const nameHash = await qnns.hashName(name);
      const registered = await qnns.isRegistered(nameHash);
      if (!registered) {
        setData(null);
        return;
      }
      const full = await qnns.getFullNameData(nameHash);
      setData(full);
      try {
        const o = await qnns.ownerOf(nameHash);
        setOwner(o);
      } catch {
        // Token might not exist
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, owner, loading, error, lookup };
}

export function useNameAvailability() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async (name: string) => {
    if (!name) {
      setAvailable(null);
      return;
    }
    setLoading(true);
    try {
      const result = await qnns.isAvailable(name);
      setAvailable(result);
    } catch {
      setAvailable(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { available, loading, check };
}

export function usePricing() {
  const [minLock, setMinLock] = useState<bigint | null>(null);
  const [registrationFee7Plus, setRegistrationFee7Plus] = useState<bigint | null>(null);
  const [auctionFloor4to6, setAuctionFloor4to6] = useState<bigint | null>(null);
  const [auctionFloor1to3, setAuctionFloor1to3] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lock, fee7Plus, floor4to6, floor1to3] = await Promise.all([
        qnns.getMinLockAmount(),
        qnns.getRegistrationFee7Plus(),
        qnns.getAuctionFloor4to6(),
        qnns.getAuctionFloor1to3(),
      ]);
      setMinLock(lock);
      setRegistrationFee7Plus(fee7Plus);
      setAuctionFloor4to6(floor4to6);
      setAuctionFloor1to3(floor1to3);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const getYearlyPrice = useCallback(async (nameLength: number): Promise<bigint> => {
    return await qnns.getYearlyPriceQuaiByLength(nameLength);
  }, []);

  // Get the minimum bid for an auction based on name length
  const getAuctionFloor = useCallback((nameLength: number): bigint | null => {
    if (nameLength <= 3) return auctionFloor1to3;
    if (nameLength <= 6) return auctionFloor4to6;
    return null; // 7+ chars use instant registration
  }, [auctionFloor1to3, auctionFloor4to6]);

  // Get the registration fee based on name length
  const getRegistrationFee = useCallback((nameLength: number): bigint | null => {
    if (nameLength >= 7) return registrationFee7Plus;
    return null; // Short names use auction
  }, [registrationFee7Plus]);

  return {
    minLock,
    registrationFee7Plus,
    auctionFloor4to6,
    auctionFloor1to3,
    loading,
    load,
    getYearlyPrice,
    getAuctionFloor,
    getRegistrationFee,
  };
}

export function useRecentActivity() {
  const [auctions, setAuctions] = useState<Array<{ auctionId: bigint; nameHash: string; name: string; initiator: string; blockNumber: number }>>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const results = await qnns.getRecentAuctions(20);
      setAuctions(results);
    } catch {
      // Silently fail — activity feed is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  return { auctions, loading, fetch };
}

export function useUserNames() {
  const [names, setNames] = useState<Array<{ nameHash: string; data: qnns.NameCore }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (address: string) => {
    if (!address) return;
    setLoading(true);
    try {
      console.log('[useUserNames] Loading names for:', address);
      const nameHashes = await qnns.getNamesOwnedBy(address);
      console.log('[useUserNames] Found nameHashes:', nameHashes);
      const results: Array<{ nameHash: string; data: qnns.NameCore }> = [];
      for (const nh of nameHashes) {
        const data = await qnns.getNameData(nh);
        console.log('[useUserNames] Name data for', nh, ':', data);
        if (data) {
          results.push({ nameHash: nh, data });
        }
      }
      setNames(results);
    } catch (e) {
      console.error('[useUserNames] Error:', e);
      setNames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { names, loading, load };
}
