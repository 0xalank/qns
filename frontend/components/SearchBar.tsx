'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isValidName, nameValidationError, getNamePriceTier, getRegistrationType } from '@/lib/utils';
import { isAvailable } from '@/lib/qnns';

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [validationErr, setValidationErr] = useState<string | null>(null);

  const checkName = useCallback(async (name: string) => {
    if (!isValidName(name)) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    try {
      const result = await isAvailable(name);
      setAvailable(result);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const name = query.toLowerCase().trim();
    const err = name.length > 0 ? nameValidationError(name) : null;
    setValidationErr(err);

    if (err || name.length === 0) {
      setAvailable(null);
      return;
    }

    const timeout = setTimeout(() => checkName(name), 400);
    return () => clearTimeout(timeout);
  }, [query, checkName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = query.toLowerCase().trim();
    if (!isValidName(name)) return;

    if (available) {
      router.push(`/register?name=${encodeURIComponent(name)}`);
    } else {
      router.push(`/${encodeURIComponent(name)}`);
    }
  };

  const name = query.toLowerCase().trim();

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a name..."
          className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-5 py-4 text-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!query.trim() || !!validationErr}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {available === true
            ? (getRegistrationType(name) === 'instant' ? 'Register' : 'Auction')
            : 'Search'}
        </button>
      </div>

      {query.trim() && (
        <div className="mt-2 px-1">
          {validationErr && (
            <p className="text-sm text-red-400">{validationErr}</p>
          )}
          {!validationErr && checking && (
            <p className="text-sm text-neutral-400">Checking availability...</p>
          )}
          {!validationErr && !checking && available === true && (
            <p className="text-sm text-green-400">
              <span className="font-bold">{name}</span> is available!{' '}
              <span className={getRegistrationType(name) === 'instant' ? 'text-green-500' : 'text-yellow-500'}>
                ({getNamePriceTier(name)})
              </span>
            </p>
          )}
          {!validationErr && !checking && available === false && (
            <p className="text-sm text-yellow-400">
              <span className="font-bold">{name}</span> is taken.{' '}
              <button
                type="button"
                onClick={() => router.push(`/${encodeURIComponent(name)}`)}
                className="text-blue-400 hover:underline"
              >
                View profile
              </button>
            </p>
          )}
        </div>
      )}
    </form>
  );
}
