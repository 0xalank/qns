'use client';

import { useState, useCallback } from 'react';
import * as qns from '@/lib/qns';

export function useProfileLookup() {
  const [profile, setProfile] = useState<qns.QNSProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const result = await qns.getProfile(name);
      setProfile(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { profile, loading, error, lookup };
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
      const result = await qns.isAvailable(name);
      setAvailable(result);
    } catch {
      setAvailable(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { available, loading, check };
}

export function useRecentRegistrations() {
  const [registrations, setRegistrations] = useState<Array<{ name: string; owner: string; nameHash: string; blockNumber: number }>>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const results = await qns.getRecentRegistrations(20);
      setRegistrations(results);
    } catch {
      // Silently fail — activity feed is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  return { registrations, loading, fetch };
}
