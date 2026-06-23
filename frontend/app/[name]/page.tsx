'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ProfileCard } from '@/components/ProfileCard';
import { useWallet } from '@/hooks/useWallet';
import { useNameLookup } from '@/hooks/useQNNS';
import Link from 'next/link';

function Notice({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="reg-rise mx-auto max-w-xl py-16 text-center">
      <h1 className="break-all font-display text-4xl text-ink">
        {name}<span className="text-muted">.quai</span>
      </h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const name = decodeURIComponent(params.name as string);
  const { address } = useWallet();
  const { data, owner, loading, error, lookup } = useNameLookup();

  useEffect(() => {
    lookup(name);
  }, [name, lookup]);

  if (loading) {
    return (
      <Notice name={name}>
        <p className="font-mono text-sm uppercase tracking-[0.16em] text-muted">Looking up…</p>
      </Notice>
    );
  }

  if (error) {
    return (
      <Notice name={name}>
        <p className="text-bad">{error}</p>
      </Notice>
    );
  }

  if (!data) {
    return (
      <Notice name={name}>
        <span className="reg-stamp reg-stamp-good reg-stamped">Available</span>
        <p className="mx-auto mt-5 max-w-sm leading-7 text-muted">
          This name isn&apos;t registered yet. It&apos;s open to claim and bind to your wallet.
        </p>
        <Link href={`/register?name=${encodeURIComponent(name)}`} className="reg-btn reg-btn-stamp mt-6">
          Claim {name}.quai →
        </Link>
      </Notice>
    );
  }

  const isOwner = address && owner && owner.toLowerCase() === address.toLowerCase();

  return (
    <div className="py-2">
      <ProfileCard name={name} data={data} owner={owner || ''} isOwner={!!isOwner} />
    </div>
  );
}
