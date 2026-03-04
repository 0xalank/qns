'use client';

import { FullNameData } from '@/lib/qnns';
import { CopyButton } from './CopyButton';
import { truncateAddress, truncatePaymentCode, formatDate, timeUntil, formatQuai, expiryStatusLabel, expiryBadgeColor } from '@/lib/utils';
import Link from 'next/link';

interface ProfileCardProps {
  name: string;
  data: FullNameData;
  owner: string;
  isOwner?: boolean;
}

export function ProfileCard({ name, data, owner, isOwner }: ProfileCardProps) {
  const expiresAt = Number(data.expiresAt);
  const avatarUrl = data.avatar && data.avatar !== '0x'
    ? `data:image/png;base64,${Buffer.from(data.avatar.slice(2), 'hex').toString('base64')}`
    : null;

  return (
    <div className="bg-neutral-900 rounded-xl p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-neutral-600">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${expiryBadgeColor(expiresAt)}`}>
              {expiryStatusLabel(expiresAt)}
            </span>
          </div>
          {data.displayName && (
            <p className="text-neutral-400 mt-0.5">{data.displayName}</p>
          )}
          {data.description && (
            <p className="text-neutral-300 mt-2 text-sm">{data.description}</p>
          )}
          {data.url && (
            <a
              href={data.url.startsWith('http') ? data.url : `https://${data.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline text-sm mt-1 inline-block"
            >
              {data.url}
            </a>
          )}
        </div>
        {isOwner && (
          <Link
            href="/me"
            className="text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Edit
          </Link>
        )}
      </div>

      {/* Addresses */}
      <div className="space-y-3 mb-6">
        <div>
          <label className="text-xs text-neutral-500 uppercase tracking-wide">Quai Address</label>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-sm font-mono text-neutral-200 bg-neutral-800 px-3 py-1.5 rounded flex-1 truncate">
              {data.quaiAddress}
            </code>
            <CopyButton text={data.quaiAddress} />
          </div>
        </div>

        {data.qiPaymentCode && (
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wide">Qi Payment Code</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm font-mono text-neutral-200 bg-neutral-800 px-3 py-1.5 rounded flex-1 truncate">
                {truncatePaymentCode(data.qiPaymentCode, 12)}
              </code>
              <CopyButton text={data.qiPaymentCode} />
              <Link
                href={`/derive?code=${encodeURIComponent(data.qiPaymentCode)}`}
                className="text-xs bg-blue-800 hover:bg-blue-700 text-blue-200 px-2 py-1 rounded transition-colors"
              >
                Derive
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Nostr */}
      {data.nostrPubkey && (
        <div className="mb-6">
          <label className="text-xs text-neutral-500 uppercase tracking-wide">Nostr Public Key</label>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-sm font-mono text-purple-400 bg-neutral-800 px-3 py-1.5 rounded flex-1 truncate">
              {data.nostrPubkey}
            </code>
            <CopyButton text={data.nostrPubkey} />
          </div>
        </div>
      )}

      {/* Socials */}
      {(data.twitter || data.github || data.discord || data.telegram) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {data.twitter && (
            <a href={`https://x.com/${data.twitter}`} target="_blank" rel="noopener noreferrer" className="text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors">
              X: @{data.twitter}
            </a>
          )}
          {data.github && (
            <a href={`https://github.com/${data.github}`} target="_blank" rel="noopener noreferrer" className="text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors">
              GitHub: {data.github}
            </a>
          )}
          {data.discord && (
            <span className="text-sm bg-neutral-800 text-neutral-300 px-3 py-1.5 rounded-lg">
              Discord: {data.discord}
            </span>
          )}
          {data.telegram && (
            <a href={`https://t.me/${data.telegram}`} target="_blank" rel="noopener noreferrer" className="text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors">
              Telegram: @{data.telegram}
            </a>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
        <span>Expires: {formatDate(expiresAt)}</span>
        {expiresAt > 0 && (
          <span>Time left: {timeUntil(expiresAt)}</span>
        )}
        <span>Lock: {formatQuai(data.lockAmount)} QUAI</span>
        <span>Owner: {truncateAddress(owner)}</span>
      </div>
    </div>
  );
}
