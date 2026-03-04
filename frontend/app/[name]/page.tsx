'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ProfileCard } from '@/components/ProfileCard';
import { useWallet } from '@/hooks/useWallet';
import { useNameLookup } from '@/hooks/useQNNS';
import Link from 'next/link';

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
      <div className="text-center py-20">
        <p className="text-neutral-400">Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-2">{name}</h1>
        <p className="text-red-400 mb-4">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-2">{name}</h1>
        <p className="text-neutral-400 mb-4">This name is not registered.</p>
        <Link
          href={`/register?name=${encodeURIComponent(name)}`}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-block transition-colors"
        >
          Register it
        </Link>
      </div>
    );
  }

  const isOwner = address && owner && owner.toLowerCase() === address.toLowerCase();

  return (
    <div className="py-4">
      <ProfileCard name={name} data={data} owner={owner || ''} isOwner={!!isOwner} />
    </div>
  );
}
