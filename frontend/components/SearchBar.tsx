'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isValidName, nameValidationError, getRegistrationType } from '@/lib/utils';
import { isAvailable } from '@/lib/qnns';

export function SearchBar({ onQueryChange }: { onQueryChange?: (query: string) => void }) {
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
    onQueryChange?.(name);
    const err = name.length > 0 ? nameValidationError(name) : null;
    setValidationErr(err);

    if (err || name.length === 0) {
      setAvailable(null);
      return;
    }

    const timeout = setTimeout(() => checkName(name), 400);
    return () => clearTimeout(timeout);
  }, [query, checkName, onQueryChange]);

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
  const action = available === true
    ? (getRegistrationType(name) === 'instant' ? 'Register' : 'Auction')
    : 'Look up';

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="reg-record flex flex-col gap-3 p-2 transition-colors focus-within:border-blue sm:flex-row sm:items-stretch">
        <div className="flex min-h-[3.5rem] flex-1 items-baseline px-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="yoursite"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent font-display text-3xl text-ink outline-none placeholder:text-faint sm:text-4xl"
          />
          <span className="ml-1 font-display text-2xl text-muted sm:text-3xl">.quai</span>
        </div>
        <button
          type="submit"
          disabled={!query.trim() || !!validationErr}
          className="reg-btn reg-btn-stamp min-h-[3.25rem] px-7 text-[0.9rem] tracking-[0.04em] sm:min-w-[9rem]"
        >
          {action}
        </button>
      </div>

      <div className="mt-3 min-h-[1.5rem] pl-1">
        {!query.trim() && (
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">
            Lowercase letters, numbers, hyphen, underscore · up to 64 chars
          </p>
        )}
        {query.trim() && validationErr && (
          <p className="font-mono text-xs text-bad">✕ {validationErr}</p>
        )}
        {query.trim() && !validationErr && checking && (
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Checking the register…</p>
        )}
        {query.trim() && !validationErr && !checking && available === true && (
          <p className="flex items-center gap-3 text-sm text-ink">
            <span className="reg-stamp reg-stamp-good reg-stamped">Available</span>
            <span><span className="font-display text-base">{name}.quai</span> can be claimed.</span>
          </p>
        )}
        {query.trim() && !validationErr && !checking && available === false && (
          <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span className="reg-stamp reg-stamp-bad reg-stamped">Taken</span>
            <span>
              <span className="font-display text-base text-ink">{name}.quai</span> is registered.{' '}
              <button
                type="button"
                onClick={() => router.push(`/${encodeURIComponent(name)}`)}
                className="font-medium text-blue underline-offset-2 hover:underline"
              >
                View →
              </button>
            </span>
          </p>
        )}
      </div>
    </form>
  );
}
